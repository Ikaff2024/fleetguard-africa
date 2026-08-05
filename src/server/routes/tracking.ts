import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/errors.js';
import { ingestionRateLimit } from '../http/security.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { requirePermission } from '../http/rbac.js';
import { logger } from '../logger.js';
import { findVehicle } from '../repositories/fleet-repository.js';
import { ApiError } from '../http/errors.js';
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
 * même lot. Sans cette garantie, les événements sont comptés deux fois et le
 * score du chauffeur — donc sa prime — est faussé.
 *
 * ⚠️ Les points sont validés et dédoublonnés mais **pas encore persistés** :
 * la file BullMQ et la table PostGIS partitionnée arrivent en Phase 2.
 * La réponse le dit explicitement (`persisted: false`) plutôt que de laisser
 * croire à un stockage effectif.
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

    const duplicate = registerBatch(organizationId, payload.batchId, payload.points.length);

    if (duplicate) {
      logger.info(
        { batchId: payload.batchId, vehicleId: payload.vehicleId },
        'Lot GPS déjà traité — rejeu ignoré',
      );
      return res.status(200).json({
        statusCode: 200,
        data: {
          accepted: true,
          batchId: payload.batchId,
          processedPoints: duplicate.processedPoints,
          idempotentDuplicate: true,
          firstSeenAt: duplicate.firstSeenAt,
          persisted: false,
        },
      });
    }

    logger.info(
      {
        organizationId,
        vehicleId: payload.vehicleId,
        points: payload.points.length,
      },
      'Lot GPS accepté',
    );

    return res.status(202).json({
      statusCode: 202,
      data: {
        accepted: true,
        batchId: payload.batchId,
        processedPoints: payload.points.length,
        idempotentDuplicate: false,
        receivedAt: new Date().toISOString(),
        persisted: false,
        notice:
          'Points validés et dédoublonnés. La persistance PostGIS et le traitement asynchrone arrivent en Phase 2.',
      },
    });
  }),
);
