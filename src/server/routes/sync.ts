import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { logger } from '../logger.js';
import { applyOfflineBatch } from '../repositories/sync-repository.js';

export const syncRouter = Router();

const queueItemSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'FUEL_LOG',
    'MAINTENANCE_RECORD',
    'ODOMETER_UPDATE',
    'GPS_TELEMETRY',
    'ROUTE_DISPATCH',
    'GEOFENCE_RULE',
  ]),
  payload: z.record(z.string(), z.unknown()),
  timestamp: z.string(),
  status: z.enum(['PENDING', 'SYNCING', 'SYNCED', 'FAILED']),
  tenantOrgId: z.string().min(1),
  retryCount: z.number().int().min(0),
  errorMessage: z.string().optional(),
});

const syncBatchSchema = z.object({
  items: z.array(queueItemSchema).min(1).max(200),
});

/**
 * Réconciliation de la file hors-ligne (IndexedDB côté web, Room côté mobile).
 *
 * Les saisies sont réellement écrites. Un élément qui ne peut pas l'être —
 * plaque inconnue, relevé incohérent, type non pris en charge — revient marqué
 * en échec avec son motif et **reste dans la file du terrain** : acquitter ce
 * qui n'a pas été écrit ferait disparaître le geste du chauffeur sans que
 * personne ne s'en aperçoive.
 */
syncRouter.post(
  '/sync/offline-batch',
  resolveTenant,
  requirePermission('fleet:write'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const { items } = syncBatchSchema.parse(req.body);

    // Un poste hors ligne peut avoir changé d'organisation entre-temps :
    // on refuse d'appliquer des éléments appartenant à un autre tenant.
    const foreign = items.filter(item => item.tenantOrgId !== organizationId);
    if (foreign.length > 0) {
      logger.warn(
        { organizationId, foreignCount: foreign.length },
        'Éléments de synchronisation rattachés à une autre organisation — rejetés',
      );
    }

    const accepted = items.filter(item => item.tenantOrgId === organizationId);

    const applied = await applyOfflineBatch(
      organizationId,
      accepted.map(item => ({ id: item.id, type: item.type, payload: item.payload })),
    );

    const written = applied.filter(result => result.status === 'SUCCESS');
    const refused = applied.filter(result => result.status === 'FAILED');

    logger.info(
      {
        organizationId,
        written: written.length,
        refused: refused.length,
        foreign: foreign.length,
      },
      'Lot de synchronisation hors-ligne traité',
    );

    res.status(200).json({
      statusCode: 200,
      data: {
        // Seuls les éléments réellement écrits sont acquittés : le terrain
        // conserve les autres.
        syncedItemIds: written.map(result => result.id),
        rejectedItemIds: [...foreign.map(item => item.id), ...refused.map(result => result.id)],
        totalProcessed: written.length,
        processedAt: new Date().toISOString(),
        persisted: true,
        results: applied.map(result => ({
          id: result.id,
          type: result.type,
          status: result.status,
          syncedAt: new Date().toISOString(),
          serverMessage: result.message,
        })),
      },
    });
  }),
);
