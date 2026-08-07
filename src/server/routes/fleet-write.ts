import { Router } from 'express';
import { z } from 'zod';
import { db, isDatabaseEnabled, withTenant } from '../db/prisma.js';
import { requireAuthContext } from '../http/auth.js';
import { ApiError, asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { requireResourceId } from '../http/params.js';
import { mapDriver, mapMaintenanceLog, mapVehicle } from '../repositories/mappers.js';
import { recordAudit } from '../services/audit.js';

export const fleetWriteRouter = Router();

/**
 * Création et modification de la flotte.
 *
 * Sans ces routes, un client ne peut pas saisir ses propres véhicules : la
 * plateforme reste une démonstration. C'est le prérequis d'un pilote réel.
 *
 * Toutes les écritures passent par `withTenant`, donc par le Row-Level
 * Security : `organizationId` n'est jamais accepté depuis la requête, il est
 * imposé par le jeton. Un client ne peut pas créer un véhicule chez un autre.
 */

function ensureDatabase() {
  if (!isDatabaseEnabled()) {
    throw ApiError.serviceUnavailable(
      'La création de données requiert une base de données.',
      'DATABASE_UNAVAILABLE',
    );
  }
}

const vehicleInput = z.object({
  // Format libre : les plaques varient d'un pays à l'autre (RB-1234-A au
  // Bénin, DK-1234-AZ au Sénégal). Contraindre un format bloquerait des
  // clients légitimes.
  immatriculation: z.string().trim().min(3).max(20),
  vin: z.string().trim().min(5).max(32),
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  year: z
    .number()
    .int()
    .min(1980)
    .max(new Date().getFullYear() + 1),
  type: z.enum(['HEAVY_TRUCK', 'MEDIUM_TRUCK', 'VAN', 'PICKUP', 'BUS', 'CONTAINER_CARRIER']),
  fuelType: z.enum(['DIESEL', 'GASOLINE', 'HYBRID', 'ELECTRIC']),
  tankCapacityLiters: z.number().positive().max(2000),
  expectedConsumptionL100km: z.number().positive().max(200),
  currentOdometerKm: z.number().int().min(0).max(5_000_000).default(0),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'IDLE', 'OUT_OF_SERVICE']).default('ACTIVE'),
  gpsTrackerImei: z.string().trim().max(32).optional(),
  speedGovernorId: z.string().trim().max(32).optional(),
  nextServiceKm: z.number().int().positive().optional(),
});

fleetWriteRouter.post(
  '/vehicles',
  resolveTenant,
  requirePermission('fleet:write'),
  asyncHandler(async (req, res) => {
    ensureDatabase();
    const organizationId = requireTenantId(req);
    const auth = requireAuthContext(req);
    const input = vehicleInput.parse(req.body ?? {});

    // Le plafond du contrat est vérifié côté serveur : un client ne doit pas
    // pouvoir dépasser sa formule en contournant l'interface.
    const organization = await db().organization.findUnique({ where: { id: organizationId } });
    const currentCount = await withTenant(organizationId, tx =>
      tx.vehicle.count({ where: { deletedAt: null } }),
    );

    if (organization && currentCount >= organization.maxVehicles) {
      throw ApiError.forbidden(
        `Votre formule autorise ${organization.maxVehicles} véhicules. Contactez votre gestionnaire de compte pour l'étendre.`,
      );
    }

    const created = await withTenant(organizationId, tx =>
      tx.vehicle.create({ data: { ...input, organizationId } }),
    ).catch((err: unknown) => {
      // Contrainte d'unicité : message métier plutôt que trace technique.
      if (typeof err === 'object' && err && 'code' in err && err.code === 'P2002') {
        throw ApiError.badRequest('Un véhicule porte déjà cette immatriculation ou ce numéro de châssis.');
      }
      throw err;
    });

    await recordAudit(
      {
        organizationId,
        userId: auth.userId,
        userEmail: auth.email,
        action: 'VEHICLE_CREATED',
        resource: 'vehicle',
        resourceId: created.id,
        details: { immatriculation: created.immatriculation },
      },
      req,
    );

    res.status(201).json({ statusCode: 201, data: mapVehicle(created) });
  }),
);

fleetWriteRouter.patch(
  '/vehicles/:id',
  resolveTenant,
  requirePermission('fleet:write'),
  asyncHandler(async (req, res) => {
    ensureDatabase();
    const organizationId = requireTenantId(req);
    const auth = requireAuthContext(req);
    const input = vehicleInput.partial().parse(req.body ?? {});
    const vehicleId = requireResourceId(req, 'Véhicule');

    const updated = await withTenant(organizationId, async tx => {
      // `updateMany` filtré plutôt que `update` par identifiant : la mise à
      // jour ne peut pas toucher une ligne d'un autre tenant, même si le RLS
      // était mal configuré.
      const result = await tx.vehicle.updateMany({
        where: { id: vehicleId, deletedAt: null },
        data: input,
      });
      if (result.count === 0) return null;
      return tx.vehicle.findFirst({ where: { id: vehicleId } });
    });

    if (!updated) {
      throw ApiError.notFound('Véhicule introuvable dans cette organisation.');
    }

    await recordAudit(
      {
        organizationId,
        userId: auth.userId,
        userEmail: auth.email,
        action: 'VEHICLE_UPDATED',
        resource: 'vehicle',
        resourceId: updated.id,
        details: { changed: Object.keys(input) },
      },
      req,
    );

    res.json({ statusCode: 200, data: mapVehicle(updated) });
  }),
);

fleetWriteRouter.delete(
  '/vehicles/:id',
  resolveTenant,
  requirePermission('fleet:write'),
  asyncHandler(async (req, res) => {
    ensureDatabase();
    const organizationId = requireTenantId(req);
    const auth = requireAuthContext(req);
    const vehicleId = requireResourceId(req, 'Véhicule');

    // Suppression logique : l'historique de maintenance, de carburant et de
    // trajets reste rattaché au véhicule. Une suppression physique
    // effacerait des données comptables et réglementaires.
    const result = await withTenant(organizationId, tx =>
      tx.vehicle.updateMany({
        where: { id: vehicleId, deletedAt: null },
        data: { deletedAt: new Date(), status: 'OUT_OF_SERVICE' },
      }),
    );

    if (result.count === 0) {
      throw ApiError.notFound('Véhicule introuvable dans cette organisation.');
    }

    await recordAudit(
      {
        organizationId,
        userId: auth.userId,
        userEmail: auth.email,
        action: 'VEHICLE_ARCHIVED',
        resource: 'vehicle',
        resourceId: vehicleId,
      },
      req,
    );

    res.status(204).end();
  }),
);

const driverInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(30),
  licenseNumber: z.string().trim().min(3).max(40),
  licenseCategory: z.string().trim().min(1).max(10),
  licenseExpiryDate: z.string().date(),
  assignedVehicleId: z.string().uuid().nullable().optional(),
  status: z.enum(['AVAILABLE', 'ON_TRIP', 'OFF_DUTY', 'SUSPENDED']).default('AVAILABLE'),
});

fleetWriteRouter.post(
  '/drivers',
  resolveTenant,
  requirePermission('drivers:write'),
  asyncHandler(async (req, res) => {
    ensureDatabase();
    const organizationId = requireTenantId(req);
    const auth = requireAuthContext(req);
    const input = driverInput.parse(req.body ?? {});

    const created = await withTenant(organizationId, async tx => {
      // Le véhicule affecté doit appartenir à la même organisation. La requête
      // étant déjà bornée par le tenant, un identifiant étranger ne renvoie
      // simplement rien.
      if (input.assignedVehicleId) {
        const vehicle = await tx.vehicle.findFirst({
          where: { id: input.assignedVehicleId, deletedAt: null },
        });
        if (!vehicle) {
          throw ApiError.badRequest("Le véhicule affecté n'appartient pas à votre organisation.");
        }
      }

      return tx.driver.create({
        data: {
          ...input,
          licenseExpiryDate: new Date(input.licenseExpiryDate),
          organizationId,
        },
      });
    }).catch((err: unknown) => {
      if (typeof err === 'object' && err && 'code' in err && err.code === 'P2002') {
        throw ApiError.badRequest('Un chauffeur porte déjà ce numéro de permis.');
      }
      throw err;
    });

    await recordAudit(
      {
        organizationId,
        userId: auth.userId,
        userEmail: auth.email,
        action: 'DRIVER_CREATED',
        resource: 'driver',
        resourceId: created.id,
        details: { fullName: created.fullName },
      },
      req,
    );

    res.status(201).json({ statusCode: 201, data: mapDriver(created) });
  }),
);

fleetWriteRouter.patch(
  '/drivers/:id',
  resolveTenant,
  requirePermission('drivers:write'),
  asyncHandler(async (req, res) => {
    ensureDatabase();
    const organizationId = requireTenantId(req);
    const auth = requireAuthContext(req);
    const input = driverInput.partial().parse(req.body ?? {});

    const driverId = requireResourceId(req, 'Chauffeur');

    const updated = await withTenant(organizationId, async tx => {
      if (input.assignedVehicleId) {
        const vehicle = await tx.vehicle.findFirst({
          where: { id: input.assignedVehicleId, deletedAt: null },
        });
        if (!vehicle) {
          throw ApiError.badRequest("Le véhicule affecté n'appartient pas à votre organisation.");
        }
      }

      const result = await tx.driver.updateMany({
        where: { id: driverId, deletedAt: null },
        data: {
          ...input,
          ...(input.licenseExpiryDate ? { licenseExpiryDate: new Date(input.licenseExpiryDate) } : {}),
        },
      });
      if (result.count === 0) return null;
      return tx.driver.findFirst({ where: { id: driverId } });
    });

    if (!updated) {
      throw ApiError.notFound('Chauffeur introuvable dans cette organisation.');
    }

    await recordAudit(
      {
        organizationId,
        userId: auth.userId,
        userEmail: auth.email,
        action: 'DRIVER_UPDATED',
        resource: 'driver',
        resourceId: updated.id,
        details: { changed: Object.keys(input) },
      },
      req,
    );

    res.json({ statusCode: 200, data: mapDriver(updated) });
  }),
);

/**
 * Enregistrement d'un passage à l'atelier.
 *
 * Cette route manquait. L'écran du carnet d'entretien affichait pourtant la
 * ligne saisie, l'ajoutait aux totaux et l'imprimait dans un document présenté
 * comme réglementaire — le tout dans l'état React, sans jamais appeler le
 * serveur. Au rechargement de la page, l'intervention avait disparu.
 *
 * Un carnet d'entretien sert à prouver qu'une révision a eu lieu : devant un
 * assureur après un accident de freinage, devant un acheteur qui reprend le
 * camion, devant l'inspection technique. Un carnet qui oublie ne sert à rien,
 * et un carnet qui affirme se souvenir est pire.
 */
const maintenanceInput = z.object({
  vehicleId: z.string().uuid(),
  type: z.enum(['PREVENTATIVE', 'CORRECTIVE', 'TIRE_REPLACEMENT', 'OIL_CHANGE', 'BRAKE_SERVICE'] as const),
  description: z.string().trim().min(3).max(1000),
  odometerKmAtService: z.number().int().nonnegative().max(3_000_000),
  cost: z.number().nonnegative().max(1_000_000_000),
  serviceProvider: z.string().trim().min(2).max(160),
  technicianName: z.string().trim().max(160).optional(),
  technicianNotes: z.string().trim().max(2000).optional(),
  performedAt: z.string().datetime({ offset: true }).optional(),
  /**
   * Prochaine échéance kilométrique.
   *
   * Facultative et jamais déduite : l'écran ajoutait 15 000 km au compteur,
   * intervalle inventé et identique pour un tracteur routier et un utilitaire.
   * Une échéance non renseignée reste vide, et l'écran des échéances le dit.
   */
  nextServiceKmDue: z.number().int().positive().max(3_000_000).optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE'] as const).default('COMPLETED'),
});

fleetWriteRouter.post(
  '/maintenance',
  resolveTenant,
  requirePermission('maintenance:write'),
  asyncHandler(async (req, res) => {
    ensureDatabase();
    const organizationId = requireTenantId(req);
    const auth = requireAuthContext(req);
    const input = maintenanceInput.parse(req.body);

    const created = await withTenant(organizationId, async tx => {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: input.vehicleId, deletedAt: null },
        select: { id: true, currentOdometerKm: true },
      });
      if (!vehicle) return null;

      const organization = await tx.organization.findFirst({
        where: { id: organizationId },
        select: { currency: true },
      });

      const log = await tx.maintenanceLog.create({
        data: {
          organizationId,
          vehicleId: input.vehicleId,
          type: input.type,
          description: input.description,
          odometerKmAtService: input.odometerKmAtService,
          cost: input.cost,
          currency: organization?.currency ?? 'XOF',
          serviceProvider: input.serviceProvider,
          technicianName: input.technicianName ?? null,
          // Aucune note par défaut : « Entretien réalisé selon les normes
          // constructeur » était une attestation attribuée à un mécanicien qui
          // n'avait rien écrit.
          technicianNotes: input.technicianNotes ?? null,
          performedAt: input.performedAt ? new Date(input.performedAt) : new Date(),
          nextServiceKmDue: input.nextServiceKmDue ?? null,
          status: input.status,
        },
      });

      /**
       * Le compteur du véhicule suit le relevé de l'atelier, s'il est plus
       * élevé. Un compteur ne recule pas : une saisie inférieure est ignorée
       * plutôt que d'écraser un kilométrage déjà remonté du terrain.
       */
      if (input.odometerKmAtService > vehicle.currentOdometerKm) {
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { currentOdometerKm: input.odometerKmAtService },
        });
      }

      if (input.nextServiceKmDue) {
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { nextServiceKm: input.nextServiceKmDue },
        });
      }

      return log;
    });

    if (!created) {
      throw ApiError.notFound('Véhicule introuvable dans cette organisation.');
    }

    await recordAudit(
      {
        organizationId,
        userId: auth.userId,
        userEmail: auth.email,
        action: 'MAINTENANCE_RECORDED',
        resource: 'maintenance',
        resourceId: created.id,
        details: { vehicleId: input.vehicleId, type: input.type, cost: input.cost },
      },
      req,
    );

    res.status(201).json({ statusCode: 201, data: mapMaintenanceLog(created) });
  }),
);
