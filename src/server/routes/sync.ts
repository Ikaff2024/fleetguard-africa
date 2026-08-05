import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/errors.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { logger } from '../logger.js';

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
 * ⚠️ Cette route acquitte les éléments après validation, mais n'écrit encore
 * rien en base : la persistance arrive en Phase 1. Elle le signale via
 * `persisted: false` — un acquittement mensonger ferait vider la file locale
 * du terrain et **perdrait définitivement** les saisies du chauffeur.
 */
syncRouter.post(
  '/sync/offline-batch',
  resolveTenant,
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

    const results = accepted.map(item => ({
      id: item.id,
      type: item.type,
      status: 'SUCCESS' as const,
      syncedAt: new Date().toISOString(),
      serverMessage: `Mise à jour "${item.type}" validée par le serveur.`,
    }));

    logger.info(
      { organizationId, accepted: accepted.length, rejected: foreign.length },
      'Lot de synchronisation hors-ligne traité',
    );

    res.status(200).json({
      statusCode: 200,
      data: {
        syncedItemIds: accepted.map(i => i.id),
        rejectedItemIds: foreign.map(i => i.id),
        totalProcessed: accepted.length,
        processedAt: new Date().toISOString(),
        persisted: false,
        results,
      },
    });
  }),
);
