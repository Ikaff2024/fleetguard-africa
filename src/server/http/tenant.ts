import type { NextFunction, Request, Response } from 'express';
import { isDatabaseEnabled } from '../db/prisma.js';
import { isProduction } from '../env.js';
import { requireAuth } from './auth.js';
import { ApiError } from './errors.js';
import type { Role } from './rbac.js';

/**
 * Détermination du tenant courant.
 *
 * Chemin nominal : l'organisation provient du jeton signé (`requireAuth`).
 * Elle est donc **prouvée**, et non déclarée par le client — c'est ce qui
 * distingue ce mécanisme de l'en-tête `X-Organization-Id` qu'il remplace.
 *
 * Chemin de démonstration : sans base de données, aucun compte n'existe et
 * l'authentification est impossible. L'API accepte alors `X-Organization-Id`
 * pour naviguer dans le jeu de démonstration. Ce mode est cantonné au
 * développement : la configuration exige `DATABASE_URL` en production
 * (voir env.ts), le repli y est donc inatteignable.
 */

/**
 * En démonstration, tous les modules doivent être explorables : le rôle le plus
 * large est donc retenu. Ce mode n'existe qu'hors production.
 */
const DEMO_ROLE: Role = 'ORGANIZATION_ADMIN';

export function resolveTenant(req: Request, res: Response, next: NextFunction) {
  // Un jeton présent est toujours prioritaire, même en mode démonstration.
  const hasBearer = req.headers.authorization?.startsWith('Bearer ');

  if (hasBearer || isDatabaseEnabled() || isProduction) {
    return requireAuth(req, res, next);
  }

  const raw = (req.header('x-organization-id') || req.query.organizationId) as string | undefined;

  if (!raw) {
    return next(
      ApiError.badRequest(
        "Organisation non précisée : authentifiez-vous, ou renseignez l'en-tête X-Organization-Id en mode démonstration.",
      ),
    );
  }

  // Le jeu de démonstration est en mémoire : la validation reste synchrone.
  import('../../data/mock-data.js')
    .then(({ MOCK_ORGANIZATIONS }) => {
      const org = MOCK_ORGANIZATIONS.find(o => o.id === raw);
      if (!org) {
        // Message identique à celui d'un accès non autorisé : on ne confirme
        // pas l'existence d'une organisation à un tiers.
        return next(ApiError.forbidden('Organisation inconnue ou non autorisée.'));
      }

      req.auth = {
        userId: 'demo-user',
        organizationId: org.id,
        role: DEMO_ROLE,
        email: 'demonstration@fleetguard.africa',
      };
      res.setHeader('X-FleetGuard-Mode', 'demonstration');
      next();
    })
    .catch(next);
}

/** Identifiant de l'organisation courante. */
export function requireTenantId(req: Request): string {
  if (!req.auth) {
    throw new ApiError(500, 'Tenant non résolu : middleware resolveTenant manquant sur cette route.');
  }
  return req.auth.organizationId;
}
