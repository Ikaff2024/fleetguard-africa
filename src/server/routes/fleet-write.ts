import { Router } from 'express';
import { z } from 'zod';
import { db, isDatabaseEnabled, withTenant } from '../db/prisma.js';
import { requireAuthContext } from '../http/auth.js';
import { ApiError, asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { requireResourceId } from '../http/params.js';
import { mapDriver, mapVehicle } from '../repositories/mappers.js';
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
