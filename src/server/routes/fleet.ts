import { Router } from 'express';
import { asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import {
  findOrganizationById,
  listComplianceDocs,
  listDrivers,
  listFuelLogs,
  listMaintenanceLogs,
  listVehicles,
} from '../repositories/fleet-repository.js';
import { ApiError } from '../http/errors.js';

export const fleetRouter = Router();

/**
 * Chaque route déclare explicitement son middleware de tenant et sa permission.
 * Aucune application globale au routeur : une route oubliée saute aux yeux à la
 * relecture, et un chemin inconnu renvoie bien 404 plutôt qu'une erreur
 * d'authentification trompeuse.
 */

fleetRouter.get(
  '/organizations/me',
  resolveTenant,
  asyncHandler(async (req, res) => {
    const organization = await findOrganizationById(requireTenantId(req));
    if (!organization) {
      throw ApiError.notFound('Organisation introuvable.');
    }
    res.json({ statusCode: 200, data: organization });
  }),
);

fleetRouter.get(
  '/vehicles',
  resolveTenant,
  requirePermission('fleet:read'),
  asyncHandler(async (req, res) => {
    res.json({ statusCode: 200, data: await listVehicles(requireTenantId(req)) });
  }),
);

fleetRouter.get(
  '/drivers',
  resolveTenant,
  requirePermission('drivers:read'),
  asyncHandler(async (req, res) => {
    res.json({ statusCode: 200, data: await listDrivers(requireTenantId(req)) });
  }),
);

fleetRouter.get(
  '/maintenance',
  resolveTenant,
  requirePermission('maintenance:read'),
  asyncHandler(async (req, res) => {
    res.json({ statusCode: 200, data: await listMaintenanceLogs(requireTenantId(req)) });
  }),
);

fleetRouter.get(
  '/fuel',
  resolveTenant,
  requirePermission('fuel:read'),
  asyncHandler(async (req, res) => {
    res.json({ statusCode: 200, data: await listFuelLogs(requireTenantId(req)) });
  }),
);

fleetRouter.get(
  '/compliance',
  resolveTenant,
  requirePermission('compliance:read'),
  asyncHandler(async (req, res) => {
    res.json({ statusCode: 200, data: await listComplianceDocs(requireTenantId(req)) });
  }),
);
