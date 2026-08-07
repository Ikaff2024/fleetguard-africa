import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { listFatigue } from '../repositories/fatigue-repository.js';
import { LEGAL_FRAMEWORKS } from '../services/fatigue-builder.js';

export const fatigueRouter = Router();

/**
 * Charge de travail et fatigue.
 *
 * Les heures sont déduites des trajets reconstruits, jamais saisies : un carnet
 * rempli de mémoire en fin de semaine ne permettrait ni d'alerter à temps, ni
 * de défendre une décision devant un chauffeur qui la conteste.
 */
fatigueRouter.get(
  '/fatigue',
  resolveTenant,
  requirePermission('drivers:read'),
  asyncHandler(async (req, res) => {
    const { region } = z
      .object({
        region: z.enum(['UEMOA_CEDEAO', 'EAC_EAST_AFRICA', 'SADC_SOUTHERN'] as const).optional(),
      })
      .parse(req.query);

    res.json({ statusCode: 200, data: await listFatigue(requireTenantId(req), region) });
  }),
);

/** Cadres réglementaires applicables — références, non paramétrables. */
fatigueRouter.get(
  '/fatigue/frameworks',
  resolveTenant,
  requirePermission('drivers:read'),
  asyncHandler(async (_req, res) => {
    res.json({ statusCode: 200, data: LEGAL_FRAMEWORKS });
  }),
);
