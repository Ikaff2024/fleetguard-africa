import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { findOrganizationById } from '../repositories/fleet-repository.js';
import {
  StationNotFound,
  createStation,
  removeStation,
  updateStation,
  updateStationPrices,
} from '../repositories/station-repository.js';

export const stationsRouter = Router();

/**
 * Gestion du réseau conventionné.
 *
 * Un client qui signe avec une enseigne doit pouvoir enregistrer ses stations
 * lui-même : sans cet écran, seul le peuplement initial en créait, et le réseau
 * restait figé. Les tarifs, eux, bougent plusieurs fois par an dans la
 * sous-région et doivent se relever en quelques secondes.
 */
const stationInput = z.object({
  name: z.string().trim().min(2).max(160),
  brand: z.enum([
    'TOTAL_ENERGIES',
    'ORYX',
    'CORLAY',
    'SHELL',
    'PUMA',
    'PETROCI',
    'STAR_OIL',
    'OTHER',
  ] as const),
  address: z.string().trim().min(2).max(200),
  city: z.string().trim().min(1).max(80),
  country: z.string().trim().min(2).max(60),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  is24h: z.boolean().default(false),
  hasAdBlue: z.boolean().default(false),
  hasHeavyTruckParking: z.boolean().default(false),
  hasRestArea: z.boolean().default(false),
  hasMechanic: z.boolean().default(false),
  contactPhone: z.string().trim().max(30).optional(),
});

stationsRouter.post(
  '/fuel-stations',
  resolveTenant,
  requirePermission('fuel:write'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const created = await createStation(organizationId, stationInput.parse(req.body));
    res.status(201).json({ statusCode: 201, data: created });
  }),
);

stationsRouter.patch(
  '/fuel-stations/:id',
  resolveTenant,
  requirePermission('fuel:write'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    try {
      await updateStation(organizationId, req.params.id!, stationInput.partial().parse(req.body));
    } catch (err) {
      if (err instanceof StationNotFound) throw ApiError.notFound('Station introuvable.');
      throw err;
    }
    res.json({ statusCode: 200, data: { updated: true } });
  }),
);

/** Relevé de prix : l'opération courante, réduite à l'essentiel. */
const priceInput = z
  .object({
    dieselPrice: z.number().positive().max(100_000).optional(),
    adbluePrice: z.number().positive().max(100_000).optional(),
    gasolinePrice: z.number().positive().max(100_000).optional(),
  })
  .refine(value => Object.values(value).some(price => price !== undefined), {
    message: 'Indiquez au moins un tarif relevé.',
  });

stationsRouter.patch(
  '/fuel-stations/:id/prices',
  resolveTenant,
  requirePermission('fuel:write'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const prices = priceInput.parse(req.body);

    // La devise suit l'organisation : un tarif en francs CFA affiché à un
    // transporteur nigérian serait faux.
    const organization = await findOrganizationById(organizationId);

    try {
      await updateStationPrices(organizationId, req.params.id!, prices, organization?.currency ?? 'XOF');
    } catch (err) {
      if (err instanceof StationNotFound) throw ApiError.notFound('Station introuvable.');
      throw err;
    }

    res.json({ statusCode: 200, data: { observedAt: new Date().toISOString() } });
  }),
);

stationsRouter.delete(
  '/fuel-stations/:id',
  resolveTenant,
  requirePermission('fuel:write'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    try {
      await removeStation(organizationId, req.params.id!);
    } catch (err) {
      if (err instanceof StationNotFound) throw ApiError.notFound('Station introuvable.');
      throw err;
    }
    res.status(204).end();
  }),
);
