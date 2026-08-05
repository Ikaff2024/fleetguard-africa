import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './errors.js';
import type { Role } from './rbac.js';
import { verifyAccessToken } from '../services/tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        organizationId: string;
        role: Role;
        email: string;
      };
    }
  }
}

/**
 * Authentification par jeton porteur.
 *
 * Le tenant est extrait du jeton **signé**, jamais d'un en-tête ou d'un
 * paramètre fourni par le client. C'est la différence de fond avec le
 * mécanisme provisoire qu'il remplace : l'appartenance à une organisation
 * devient une donnée prouvée, plus une déclaration.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Jeton d’accès manquant.');
    }

    const claims = await verifyAccessToken(header.slice(7).trim());

    req.auth = {
      userId: claims.sub,
      organizationId: claims.organizationId,
      role: claims.role,
      email: claims.email,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/** Contexte authentifié, ou échec bruyant si le middleware a été oublié. */
export function requireAuthContext(req: Request) {
  if (!req.auth) {
    throw new ApiError(500, 'Contexte d’authentification absent : middleware requireAuth manquant.');
  }
  return req.auth;
}
