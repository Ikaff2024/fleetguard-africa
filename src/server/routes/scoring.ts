import { Router } from 'express';
import { calculateDriverSafetyScore } from '../../data/scoring-engine.js';
import { requireAuthContext } from '../http/auth.js';
import { ApiError, asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { findDriver, getScoreConfig, listSafetyEvents } from '../repositories/fleet-repository.js';
import { recordAudit } from '../services/audit.js';

export const scoringRouter = Router();

/**
 * Configuration active du calcul de score.
 *
 * Exposée parce que l'interface doit pouvoir expliquer un score : sans les
 * pondérations en vigueur, « -12 points » reste une sanction opaque, et un
 * chauffeur ne peut pas la contester utilement.
 */
scoringRouter.get(
  '/scoring/config',
  resolveTenant,
  requirePermission('scoring:read'),
  asyncHandler(async (req, res) => {
    res.json({ statusCode: 200, data: await getScoreConfig(requireTenantId(req)) });
  }),
);

/**
 * Score de sécurité détaillé d'un chauffeur.
 *
 * Le calcul reste serveur : un score qui conditionne une sanction ou une prime
 * ne peut pas être recalculé — donc négocié — côté client.
 */
scoringRouter.get(
  '/scoring/drivers/:id',
  resolveTenant,
  requirePermission('scoring:read'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const auth = requireAuthContext(req);
    const driverId = req.params.id!;

    const driver = await findDriver(organizationId, driverId);
    if (!driver) {
      throw ApiError.notFound('Chauffeur introuvable dans cette organisation.');
    }

    // Un chauffeur ne consulte que son propre dossier ; les autres rôles
    // disposent d'une vue d'équipe.
    if (auth.role === 'DRIVER' && driver.userId !== auth.userId) {
      throw ApiError.forbidden('Vous ne pouvez consulter que votre propre score.');
    }

    const [events, config] = await Promise.all([
      listSafetyEvents(organizationId, driver.id),
      getScoreConfig(organizationId),
    ]);

    const scoreResult = calculateDriverSafetyScore(
      {
        // TODO Phase 2 : distance réellement parcourue sur la période, issue de
        // la télémétrie. Cette constante vient du jeu de démonstration et
        // fausserait tout score calculé sur des données réelles.
        distanceDrivenKm: 850,
        overspeedEventsCount: events.filter(e => e.eventType === 'OVER_SPEED').length,
        harshBrakingEventsCount: events.filter(e => e.eventType === 'HARSH_BRAKING').length,
        rapidAccelEventsCount: events.filter(e => e.eventType === 'RAPID_ACCELERATION').length,
        nightHoursDriven: events.filter(e => e.eventType === 'FATIGUE_NIGHT_DRIVING').length * 2,
        geofenceBreachesCount: events.filter(e => e.eventType === 'GEOFENCE_BREACH').length,
      },
      config,
    );

    // Consulter le dossier nominatif d'un chauffeur est une action traçable.
    await recordAudit(
      {
        organizationId,
        userId: auth.userId,
        userEmail: auth.email,
        action: 'DRIVER_SCORE_VIEWED',
        resource: 'driver',
        resourceId: driver.id,
      },
      req,
    );

    res.json({ statusCode: 200, data: { driver, scoreResult, events } });
  }),
);
