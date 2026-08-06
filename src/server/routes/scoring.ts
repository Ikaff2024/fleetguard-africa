import { Router } from 'express';
import { isDatabaseEnabled } from '../db/prisma.js';
import { requireAuthContext } from '../http/auth.js';
import { ApiError, asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { findDriver, getScoreConfig, listSafetyEvents } from '../repositories/fleet-repository.js';
import { recordAudit } from '../services/audit.js';
import { computeDriverScore, listDailyScores, persistDailyScore } from '../services/scoring-service.js';

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
 *
 * La distance est celle réellement parcourue, reconstituée depuis les points
 * GPS. Quand aucune télémétrie n'existe, la réponse le signale
 * (`basedOnRealTelemetry: false`) : un score calculé sans distance n'a aucune
 * valeur probante et ne doit pas servir de base à une décision.
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

    const config = await getScoreConfig(organizationId);
    const [summary, events] = await Promise.all([
      computeDriverScore(organizationId, driver.id, config),
      listSafetyEvents(organizationId, driver.id),
    ]);

    // L'historisation n'est faite que sur des données réelles : enregistrer un
    // score calculé sans télémétrie polluerait la tendance du chauffeur.
    // Elle précède la lecture de l'historique, sinon le score du jour manque à
    // la courbe au premier affichage.
    // Seul un score représentatif devient la note officielle du chauffeur :
    // historiser un calcul fait sur quelques kilomètres fausserait sa tendance
    // et, à terme, sa prime.
    if (isDatabaseEnabled() && summary.isSignificant) {
      await persistDailyScore(organizationId, driver.id, config.id, summary);
    }

    const history = await listDailyScores(organizationId, driver.id);

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

    res.json({
      statusCode: 200,
      data: {
        driver,
        scoreResult: {
          score: summary.score,
          distanceDrivenKm: summary.distanceDrivenKm,
          totalPenalties: Math.round((100 - summary.score) * 10) / 10,
          breakdown: summary.breakdown,
          explanations: summary.explanations,
          normalizedDistanceFactor:
            Math.round((summary.distanceDrivenKm / config.normalizationDistanceKm) * 100) / 100,
        },
        period: { from: summary.periodFrom, to: summary.periodTo },
        basedOnRealTelemetry: summary.basedOnRealTelemetry,
        isSignificant: summary.isSignificant,
        minimumDistanceKm: summary.minimumDistanceKm,
        configVersion: summary.configVersion,
        history,
        events,
      },
    });
  }),
);
