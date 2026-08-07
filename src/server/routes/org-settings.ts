import { Router } from 'express';
import { z } from 'zod';
import { isDatabaseEnabled, withTenant } from '../db/prisma.js';
import { ApiError, asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';

export const orgSettingsRouter = Router();

/**
 * Seuils de détection de l'organisation.
 *
 * Ils étaient constants dans le code : les valider avec un exploitant demandait
 * une modification et un déploiement. Ils varient pourtant d'un pays et d'un
 * métier à l'autre.
 *
 * La modification relève de la configuration de l'entreprise, pas de
 * l'exploitation quotidienne : abaisser la limite change la note de chaque
 * chauffeur, donc les primes versées.
 */
const thresholdInput = z.object({
  // 40 à 130 : au-delà on ne détecte plus rien, en deçà tout devient infraction.
  openRoadSpeedLimitKmH: z.number().int().min(40).max(130),
  speedToleranceKmH: z.number().int().min(0).max(20),
  minOverspeedDurationSeconds: z.number().int().min(5).max(600),
  nightStartHour: z.number().int().min(0).max(23),
  nightEndHour: z.number().int().min(0).max(23),
});

orgSettingsRouter.get(
  '/organizations/me/detection-thresholds',
  resolveTenant,
  requirePermission('scoring:read'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    if (!isDatabaseEnabled()) throw ApiError.serviceUnavailable('Base de données requise.');

    const thresholds = await withTenant(organizationId, async tx => {
      const organization = await tx.organization.findFirst({ where: { id: organizationId } });
      if (!organization) return null;
      return {
        openRoadSpeedLimitKmH: organization.openRoadSpeedLimitKmH,
        speedToleranceKmH: organization.speedToleranceKmH,
        minOverspeedDurationSeconds: organization.minOverspeedDurationSeconds,
        nightStartHour: organization.nightStartHour,
        nightEndHour: organization.nightEndHour,
      };
    });

    if (!thresholds) throw ApiError.notFound('Organisation introuvable.');
    res.json({ statusCode: 200, data: thresholds });
  }),
);

orgSettingsRouter.patch(
  '/organizations/me/detection-thresholds',
  resolveTenant,
  requirePermission('organization:configure'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const payload = thresholdInput.parse(req.body);

    await withTenant(organizationId, async tx => {
      await tx.organization.updateMany({ where: { id: organizationId }, data: payload });
    });

    /**
     * Les événements déjà relevés ne sont pas recalculés.
     *
     * Ils ont été constatés sous les règles en vigueur à ce moment-là, et un
     * chauffeur sanctionné hier ne doit pas voir son dossier changer parce que
     * la limite a bougé aujourd'hui. Les nouveaux lots appliqueront les
     * nouveaux seuils.
     */
    res.json({
      statusCode: 200,
      data: {
        ...payload,
        appliesTo: 'Les prochaines remontées du terrain. Les événements déjà relevés sont inchangés.',
      },
    });
  }),
);
