import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors.js';
import { aiRateLimit } from '../http/security.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { requirePermission } from '../http/rbac.js';
import { findOrganizationById } from '../repositories/fleet-repository.js';
import {
  findDriver,
  listDrivers,
  listFuelLogs,
  listMaintenanceLogs,
  listSafetyEvents,
  listVehicles,
  findVehicle,
} from '../repositories/fleet-repository.js';
import { generateFleetAnalysis, generateSafetyCoaching } from '../services/gemini.js';
import {
  buildFleetAnalysisPrompt,
  buildSafetyCoachingPrompt,
  demoFleetAnalysis,
  demoSafetyCoaching,
} from '../services/prompts.js';

export const intelligenceRouter = Router();

const analyzeSchema = z.object({
  // Borné pour éviter qu'une invite géante ne fasse exploser la facture de tokens.
  prompt: z.string().trim().min(3).max(2_000).optional(),
});

/** Analyse libre de la flotte. */
intelligenceRouter.post(
  '/intelligence/analyze',
  resolveTenant,
  requirePermission('intelligence:use'),
  aiRateLimit,
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const { prompt } = analyzeSchema.parse(req.body ?? {});

    const question =
      prompt ??
      'Analyse la santé globale de ma flotte, la consommation de carburant et les risques chauffeurs.';

    const organization = await findOrganizationById(organizationId);
    if (!organization) {
      throw ApiError.notFound('Organisation introuvable.');
    }

    // Les lectures sont parallélisées : l'invite ne peut être construite
    // qu'une fois l'ensemble des données de flotte rassemblées.
    const [vehicles, drivers, fuelLogs, maintenance] = await Promise.all([
      listVehicles(organizationId),
      listDrivers(organizationId),
      listFuelLogs(organizationId),
      listMaintenanceLogs(organizationId),
    ]);

    const result = await generateFleetAnalysis(
      buildFleetAnalysisPrompt({ organization, vehicles, drivers, fuelLogs, maintenance, question }),
      demoFleetAnalysis(organization),
    );

    res.json({ statusCode: 200, data: result });
  }),
);

const safetyTipsSchema = z.object({
  driverId: z.string().min(1),
  focusArea: z.string().trim().max(200).optional(),
});

/** Fiche de coaching personnalisée pour un chauffeur. */
intelligenceRouter.post(
  '/scoring/safety-tips',
  resolveTenant,
  requirePermission('intelligence:use'),
  aiRateLimit,
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const { driverId, focusArea } = safetyTipsSchema.parse(req.body ?? {});

    const driver = await findDriver(organizationId, driverId);
    if (!driver) {
      throw ApiError.notFound('Chauffeur introuvable dans cette organisation.');
    }

    const [assignedVehicle, events, fuelLogs] = await Promise.all([
      driver.assignedVehicleId ? findVehicle(organizationId, driver.assignedVehicleId) : undefined,
      listSafetyEvents(organizationId, driver.id),
      listFuelLogs(organizationId, driver.id),
    ]);

    const result = await generateSafetyCoaching(
      buildSafetyCoachingPrompt({ driver, assignedVehicle, events, fuelLogs, focusArea }),
      demoSafetyCoaching(driver),
    );

    res.json({ statusCode: 200, data: result });
  }),
);
