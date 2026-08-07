import { Router } from 'express';
import { z } from 'zod';
import { isDatabaseEnabled } from '../db/prisma.js';
import { ApiError, asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { ingestionRateLimit } from '../http/security.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { requireResourceId } from '../http/params.js';
import { logger } from '../logger.js';
import { findDriver, findVehicle } from '../repositories/fleet-repository.js';
import { findDriverForUser } from '../repositories/driver-identity.js';
import {
  ingestTelemetryBatch,
  listRecentSafetyEvents,
  listTrips,
  listVehiclePoints,
} from '../repositories/telemetry-repository.js';
import { registerBatch } from '../services/idempotency.js';

export const trackingRouter = Router();

/**
 * Un point GPS venant du terrain n'est jamais digne de confiance : boîtier mal
 * réglé, horloge dérivée, dérive du signal sous les arbres. Tout est validé.
 */
const gpsPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitude: z.number().optional(),
  speedKmH: z.number().min(0).max(250),
  headingDegree: z.number().min(0).max(360),
  timestamp: z.string().datetime({ offset: true }),
  accuracyMeters: z.number().min(0).max(10_000),
  ignitionOn: z.boolean(),
  batteryLevelPct: z.number().min(0).max(100),
  networkType: z.enum(['4G', '3G', '2G', 'NONE']),
  eventFlags: z
    .array(z.enum(['HARSH_BRAKE', 'HARSH_ACCEL', 'OVER_SPEED', 'GEOFENCE_ENTER', 'GEOFENCE_EXIT']))
    .optional(),
});

const batchSchema = z.object({
  batchId: z.string().min(8).max(128),
  vehicleId: z.string().min(1),
  driverId: z.string().min(1),
  deviceId: z.string().min(1).optional(),
  sentAt: z.string().datetime({ offset: true }).optional(),
  // 500 points = ~1 h 20 de roulage à 10 s d'échantillonnage. Au-delà, le
  // boîtier doit découper : cela borne la mémoire et le temps de traitement.
  points: z.array(gpsPointSchema).min(1).max(500),
});

/**
 * Ingestion par lots de la télémétrie.
 *
 * Idempotente : un boîtier qui sort d'une zone blanche rejoue fréquemment le
 * même lot. Sans cette garantie, les infractions sont comptées deux fois et le
 * score du chauffeur — donc sa prime — est faussé. Avec une base, la garantie
 * repose sur une contrainte d'unicité, donc survit au redémarrage et vaut
 * entre plusieurs instances.
 *
 * Les points sont persistés, les événements de conduite détectés côté serveur,
 * et l'odomètre mis à jour à partir de la distance réellement parcourue.
 */
trackingRouter.post(
  '/tracking/telemetry/batch',
  resolveTenant,
  requirePermission('tracking:ingest'),
  ingestionRateLimit,
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const payload = batchSchema.parse(req.body);

    const vehicle = await findVehicle(organizationId, payload.vehicleId);
    if (!vehicle) {
      throw ApiError.forbidden("Ce véhicule n'appartient pas à votre organisation.");
    }

    const driver = await findDriver(organizationId, payload.driverId);
    if (!driver) {
      throw ApiError.forbidden("Ce chauffeur n'appartient pas à votre organisation.");
    }

    /**
     * Un chauffeur n'émet que pour lui-même.
     *
     * Sans ce contrôle, un conducteur pourrait déclarer sa conduite sous le nom
     * d'un collègue : ses excès de vitesse feraient chuter le score de l'autre,
     * donc sa prime, et l'entretien disciplinaire viserait la mauvaise personne.
     * L'appartenance à l'organisation ne suffit pas — la fiche doit être la
     * sienne.
     *
     * Les comptes de bureau qui portent `tracking:ingest` (administrateurs,
     * passerelles de boîtiers) ne sont pas concernés : ils n'ont pas de fiche
     * chauffeur et déclarent pour le compte du parc.
     */
    if (req.auth?.role === 'DRIVER') {
      const own = await findDriverForUser(organizationId, req.auth.userId);
      if (!own) {
        throw ApiError.forbidden(
          "Aucune fiche chauffeur n'est rattachée à votre compte : impossible d'émettre des positions.",
        );
      }
      if (own.id !== payload.driverId) {
        throw ApiError.forbidden('Vous ne pouvez émettre des positions que sous votre propre nom.');
      }
    }

    // Sans base, l'idempotence reste en mémoire et rien n'est persisté : la
    // réponse le dit explicitement plutôt que de laisser croire au contraire.
    if (!isDatabaseEnabled()) {
      const duplicate = registerBatch(organizationId, payload.batchId, payload.points.length);

      return res.status(duplicate ? 200 : 202).json({
        statusCode: duplicate ? 200 : 202,
        data: {
          accepted: true,
          batchId: payload.batchId,
          processedPoints: duplicate?.processedPoints ?? payload.points.length,
          idempotentDuplicate: Boolean(duplicate),
          persisted: false,
          notice: 'Mode démonstration : les points sont validés mais non enregistrés.',
        },
      });
    }

    const result = await ingestTelemetryBatch({
      organizationId,
      batchId: payload.batchId,
      vehicleId: payload.vehicleId,
      driverId: payload.driverId,
      deviceId: payload.deviceId,
      sentAt: payload.sentAt,
      points: payload.points,
    });

    if (result.duplicate) {
      logger.info(
        { batchId: payload.batchId, vehicleId: payload.vehicleId },
        'Lot GPS déjà traité — rejeu ignoré',
      );
      return res.status(200).json({
        statusCode: 200,
        data: {
          accepted: true,
          batchId: result.batchId,
          processedPoints: result.processedPoints,
          idempotentDuplicate: true,
          firstSeenAt: result.firstSeenAt,
          persisted: true,
        },
      });
    }

    logger.info(
      {
        organizationId,
        vehicleId: payload.vehicleId,
        points: result.processedPoints,
        distanceKm: result.distanceKm,
        events: result.detectedEvents,
      },
      'Lot GPS enregistré',
    );

    return res.status(202).json({
      statusCode: 202,
      data: {
        accepted: true,
        batchId: result.batchId,
        processedPoints: result.processedPoints,
        idempotentDuplicate: false,
        receivedAt: result.firstSeenAt,
        persisted: true,
        distanceKm: result.distanceKm,
        detectedEvents: result.detectedEvents,
      },
    });
  }),
);

/** Trace récente d'un véhicule, pour la carte et la relecture de trajet. */
trackingRouter.get(
  '/tracking/vehicles/:id/points',
  resolveTenant,
  requirePermission('tracking:read'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);

    const vehicle = await findVehicle(organizationId, requireResourceId(req, 'Véhicule'));
    if (!vehicle) {
      throw ApiError.notFound('Véhicule introuvable dans cette organisation.');
    }

    const limit = Math.min(Number(req.query.limit ?? 500) || 500, 2000);
    const points = await listVehiclePoints(organizationId, requireResourceId(req, 'Véhicule'), limit);

    res.json({ statusCode: 200, data: points });
  }),
);

/** Événements de conduite détectés, du plus récent au plus ancien. */
trackingRouter.get(
  '/tracking/events',
  resolveTenant,
  requirePermission('tracking:read'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const limit = Math.min(Number(req.query.limit ?? 200) || 200, 500);

    res.json({ statusCode: 200, data: await listRecentSafetyEvents(organizationId, limit) });
  }),
);

/**
 * Trajets reconstruits.
 *
 * Le terrain n'envoie pas de trajets : ils sont déduits de la trace. Un
 * gestionnaire y lit ce qu'une suite de points ne montre pas — combien de
 * temps le camion est resté immobile, à quelle vitesse il a roulé une fois les
 * arrêts déduits, où la mission a commencé et fini.
 */
trackingRouter.get(
  '/tracking/trips',
  resolveTenant,
  requirePermission('tracking:read'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);

    const filters = z
      .object({
        vehicleId: z.string().min(1).optional(),
        driverId: z.string().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
      })
      .parse(req.query);

    // Le filtre est vérifié avant la requête : demander les trajets d'un
    // véhicule d'une autre organisation doit être refusé, pas répondu par une
    // liste vide qui laisserait croire à un véhicule sans activité.
    if (filters.vehicleId && !(await findVehicle(organizationId, filters.vehicleId))) {
      throw ApiError.notFound('Véhicule introuvable dans cette organisation.');
    }
    if (filters.driverId && !(await findDriver(organizationId, filters.driverId))) {
      throw ApiError.notFound('Chauffeur introuvable dans cette organisation.');
    }

    res.json({ statusCode: 200, data: await listTrips(organizationId, filters) });
  }),
);
