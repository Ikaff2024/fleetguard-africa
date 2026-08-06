import { Router } from 'express';
import { z } from 'zod';
import { isDatabaseEnabled } from '../db/prisma.js';
import { ApiError, asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { AlertNotFound, listAlerts, updateAlertStatus } from '../repositories/alert-repository.js';

export const alertsRouter = Router();

/**
 * Centre d'alertes.
 *
 * Les alertes sont dérivées des faits enregistrés — infractions relevées,
 * documents qui expirent, révisions dues, pleins incohérents — et non
 * fabriquées pour la démonstration. Chacune porte l'identifiant de sa source :
 * un régulateur doit pouvoir remonter au fait avant de sanctionner.
 */
alertsRouter.get(
  '/alerts',
  resolveTenant,
  requirePermission('alerts:read'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const limit = Math.min(Number(req.query.limit ?? 200) || 200, 500);

    res.json({ statusCode: 200, data: await listAlerts(organizationId, limit) });
  }),
);

const statusSchema = z.object({
  status: z.enum(['UNHANDLED', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'] as const),
  resolutionNote: z.string().max(2000).optional(),
});

/**
 * Traitement d'une alerte.
 *
 * C'est la seule partie d'une alerte qui ne se recalcule pas : le constat se
 * redérive, la décision d'un régulateur non. Sans cette écriture, un
 * acquittement disparaîtrait au rechargement de la page et l'incident serait
 * cru traité alors qu'il ne l'est pas.
 */
alertsRouter.patch(
  '/alerts/:id',
  resolveTenant,
  requirePermission('alerts:acknowledge'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);

    if (!isDatabaseEnabled()) {
      throw ApiError.serviceUnavailable(
        'Le traitement des alertes requiert une base de données ; en mode démonstration, il ne serait pas conservé.',
      );
    }

    const payload = statusSchema.parse(req.body);

    try {
      const alert = await updateAlertStatus(organizationId, req.params.id!, {
        status: payload.status,
        resolutionNote: payload.resolutionNote,
        userId: req.auth?.userId,
      });

      res.json({ statusCode: 200, data: alert });
    } catch (err) {
      if (err instanceof AlertNotFound) {
        throw ApiError.notFound('Alerte introuvable dans cette organisation.');
      }
      throw err;
    }
  }),
);
