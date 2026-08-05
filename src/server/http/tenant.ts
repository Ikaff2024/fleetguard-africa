import type { NextFunction, Request, Response } from 'express';
import type { Organization } from '../../types';
import { findOrganizationById } from '../repositories/fleet-repository.js';
import { ApiError } from './errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenant?: Organization;
    }
  }
}

/**
 * Résolution du tenant courant.
 *
 * ⚠️ CE MIDDLEWARE N'EST PAS UNE AUTHENTIFICATION.
 *
 * Il normalise la provenance du tenant (en-tête `X-Organization-Id`) et rejette
 * les organisations inconnues, mais n'importe qui peut encore désigner
 * n'importe quel tenant : l'identifiant n'est pas prouvé.
 *
 * L'isolation réelle arrive en Phase 1 et repose sur deux niveaux :
 *   1. le tenant lu dans un JWT signé, jamais dans une entrée client ;
 *   2. le Row-Level Security PostgreSQL, qui protège même en cas de bug applicatif.
 *
 * Tant que ces deux niveaux ne sont pas en place, l'API ne doit héberger que
 * des données de démonstration. Voir PRODUCTION_PLAN.md § Phase 1.
 */
export function resolveTenant(req: Request, _res: Response, next: NextFunction) {
  const raw = (req.header('x-organization-id') || req.query.organizationId) as string | undefined;

  if (!raw) {
    return next(ApiError.badRequest("Organisation non précisée : renseignez l'en-tête X-Organization-Id."));
  }

  const organization = findOrganizationById(raw);
  if (!organization) {
    // Message volontairement identique à celui d'un tenant non autorisé :
    // on ne confirme pas l'existence d'une organisation à un tiers.
    return next(ApiError.forbidden('Organisation inconnue ou non autorisée.'));
  }

  req.tenant = organization;
  next();
}

/** Récupère le tenant résolu, ou échoue bruyamment si le middleware a été oublié. */
export function requireTenant(req: Request): Organization {
  if (!req.tenant) {
    throw new ApiError(500, 'Tenant non résolu : middleware resolveTenant manquant sur cette route.');
  }
  return req.tenant;
}
