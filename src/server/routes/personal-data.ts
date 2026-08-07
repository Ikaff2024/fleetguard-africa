import { Router } from 'express';
import { ApiError, asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { requireResourceId } from '../http/params.js';
import { findDriverForUser } from '../repositories/driver-identity.js';
import {
  DriverNotFoundForExport,
  eraseDriverLocationData,
  exportDriverData,
} from '../repositories/personal-data-repository.js';
import { DEFAULT_RETENTION } from '../services/personal-data.js';

export const personalDataRouter = Router();

/**
 * Politique de conservation, publiée.
 *
 * Une durée de conservation qui n'existe que dans le code ne peut être opposée
 * à personne. Celle-ci est lisible par tout utilisateur authentifié, chauffeur
 * compris : c'est le minimum qu'on lui doit avant de le géolocaliser.
 */
personalDataRouter.get(
  '/privacy/retention',
  resolveTenant,
  asyncHandler(async (_req, res) => {
    res.json({
      statusCode: 200,
      data: {
        ...DEFAULT_RETENTION,
        purpose: {
          gpsPoints:
            'Reconstruire les trajets et détecter les écarts de conduite. Au-delà, le trajet reconstruit suffit et la position brute n’a plus d’usage.',
          trips: 'Rapports d’activité, calcul des primes et mesure de la charge de travail.',
          safetyEvents:
            'Fonder le score de conduite. Conservés assez longtemps pour qu’un chauffeur puisse contester une note qui lui coûte une prime.',
          handledAlerts: 'Trace du traitement effectué par le régulateur.',
        },
      },
    });
  }),
);

/**
 * Droit d'accès du chauffeur à ses propres données.
 *
 * Il s'exerce sans passer par sa hiérarchie : subordonner l'accès à l'accord du
 * gestionnaire viderait le droit de sa substance.
 */
personalDataRouter.get(
  '/privacy/me/data',
  resolveTenant,
  requirePermission('tracking:ingest'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const userId = req.auth?.userId;
    if (!userId) throw ApiError.unauthorized();

    const own = await findDriverForUser(organizationId, userId);
    if (!own) throw ApiError.notFound('Aucune fiche chauffeur n’est rattachée à ce compte.');

    res.json({ statusCode: 200, data: await exportDriverData(organizationId, own.id) });
  }),
);

/** Export d'un dossier chauffeur par l'entreprise, pour répondre à une demande. */
personalDataRouter.get(
  '/privacy/drivers/:id/data',
  resolveTenant,
  requirePermission('drivers:write'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    try {
      res.json({
        statusCode: 200,
        data: await exportDriverData(organizationId, requireResourceId(req, 'Chauffeur')),
      });
    } catch (err) {
      if (err instanceof DriverNotFoundForExport) throw ApiError.notFound('Chauffeur introuvable.');
      throw err;
    }
  }),
);

/**
 * Effacement des traces de déplacement d'un chauffeur.
 *
 * Réservé à la configuration de l'entreprise : l'opération est irréversible et
 * fait disparaître la base de calcul de scores déjà attribués.
 */
personalDataRouter.delete(
  '/privacy/drivers/:id/location-data',
  resolveTenant,
  requirePermission('organization:configure'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    try {
      const erased = await eraseDriverLocationData(organizationId, requireResourceId(req, 'Chauffeur'));
      res.json({
        statusCode: 200,
        data: {
          ...erased,
          notice:
            'Les positions et trajets sont effacés. La fiche du chauffeur est conservée : elle porte des obligations qui survivent au contrat.',
        },
      });
    } catch (err) {
      if (err instanceof DriverNotFoundForExport) throw ApiError.notFound('Chauffeur introuvable.');
      throw err;
    }
  }),
);
