import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors.js';
import { aiRateLimit } from '../http/security.js';
import { requireTenant, resolveTenant } from '../http/tenant.js';
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
  aiRateLimit,
  asyncHandler(async (req, res) => {
    const tenant = requireTenant(req);
    const { prompt } = analyzeSchema.parse(req.body ?? {});

    const question =
      prompt ??
      'Analyse la santé globale de ma flotte, la consommation de carburant et les risques chauffeurs.';

    const result = await generateFleetAnalysis(
      buildFleetAnalysisPrompt({
        organization: tenant,
        vehicles: listVehicles(tenant.id),
        drivers: listDrivers(tenant.id),
        fuelLogs: listFuelLogs(tenant.id),
        maintenance: listMaintenanceLogs(tenant.id),
        question,
      }),
      demoFleetAnalysis(tenant),
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
  aiRateLimit,
  asyncHandler(async (req, res) => {
    const tenant = requireTenant(req);
    const { driverId, focusArea } = safetyTipsSchema.parse(req.body ?? {});

    const driver = findDriver(tenant.id, driverId);
    if (!driver) {
      throw ApiError.notFound('Chauffeur introuvable dans cette organisation.');
    }

    const assignedVehicle = driver.assignedVehicleId
      ? findVehicle(tenant.id, driver.assignedVehicleId)
      : undefined;

    const result = await generateSafetyCoaching(
      buildSafetyCoachingPrompt({
        driver,
        assignedVehicle,
        events: listSafetyEvents(tenant.id, driver.id),
        fuelLogs: listFuelLogs(tenant.id, driver.id),
        focusArea,
      }),
      demoSafetyCoaching(driver),
    );

    res.json({ statusCode: 200, data: result });
  }),
);
