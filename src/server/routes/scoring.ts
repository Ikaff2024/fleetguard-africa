import { Router } from 'express';
import { calculateDriverSafetyScore } from '../../data/scoring-engine.js';
import { ApiError } from '../http/errors.js';
import { requireTenant, resolveTenant } from '../http/tenant.js';
import { findDriver, getScoreConfig, listSafetyEvents } from '../repositories/fleet-repository.js';

export const scoringRouter = Router();

/**
 * Score de sécurité détaillé d'un chauffeur.
 * Le calcul reste serveur : un score qui conditionne une prime ne peut pas être
 * recalculé — donc négocié — côté client.
 */
scoringRouter.get('/scoring/drivers/:id', resolveTenant, (req, res) => {
  const tenant = requireTenant(req);
  const driver = findDriver(tenant.id, req.params.id);

  if (!driver) {
    throw ApiError.notFound('Chauffeur introuvable dans cette organisation.');
  }

  const events = listSafetyEvents(tenant.id, driver.id);

  const scoreResult = calculateDriverSafetyScore(
    {
      // TODO Phase 2 : distance réellement parcourue sur la période, issue de la
      // télémétrie. La valeur fixe ci-dessous vient du jeu de démonstration et
      // fausserait tout score calculé sur des données réelles.
      distanceDrivenKm: 850,
      overspeedEventsCount: events.filter(e => e.eventType === 'OVER_SPEED').length,
      harshBrakingEventsCount: events.filter(e => e.eventType === 'HARSH_BRAKING').length,
      rapidAccelEventsCount: events.filter(e => e.eventType === 'RAPID_ACCELERATION').length,
      nightHoursDriven: events.filter(e => e.eventType === 'FATIGUE_NIGHT_DRIVING').length * 2,
      geofenceBreachesCount: events.filter(e => e.eventType === 'GEOFENCE_BREACH').length,
    },
    getScoreConfig(tenant.id),
  );

  res.json({ statusCode: 200, data: { driver, scoreResult, events } });
});
