import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../env.js';
import { logger } from '../logger.js';

/**
 * Erreur métier porteuse d'un statut HTTP.
 * Toute erreur non typée est traitée comme une 500 et son détail n'est jamais
 * renvoyé au client en production (fuite d'information).
 */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }
  static unauthorized(message = 'Authentification requise') {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }
  static forbidden(message = 'Accès refusé à cette ressource') {
    return new ApiError(403, message, 'FORBIDDEN');
  }
  /**
   * La demande est bien formée, mais l'état du système s'y oppose.
   *
   * Distinct d'un 400 : le gestionnaire n'a rien mal saisi, c'est la charge de
   * travail du chauffeur qui rend l'affectation impossible. Les détails sont
   * renvoyés pour que l'écran puisse l'expliquer plutôt que refuser sèchement.
   */
  static conflict(message: string, details?: unknown) {
    return new ApiError(409, message, 'CONFLICT', details);
  }

  static notFound(message = 'Ressource introuvable') {
    return new ApiError(404, message, 'NOT_FOUND');
  }
  static serviceUnavailable(message: string, code = 'SERVICE_UNAVAILABLE') {
    return new ApiError(503, message, code);
  }
}

/** 404 pour toute route d'API non déclarée. */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    statusCode: 404,
    code: 'NOT_FOUND',
    message: `Route inconnue : ${req.method} ${req.path}`,
  });
}

/** Gestionnaire d'erreurs central — dernier middleware de la chaîne. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Charge utile invalide.',
      details: err.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error({ err, reqId: req.id }, 'Erreur serveur');
    }
    res.status(err.statusCode).json({
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  logger.error({ err, reqId: req.id, path: req.path }, 'Exception non gérée');
  res.status(500).json({
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'Erreur interne du serveur.',
    // La stack ne sort jamais en production.
    ...(isProduction ? {} : { debug: err instanceof Error ? err.message : String(err) }),
  });
}

/**
 * Enrobe un handler asynchrone pour que toute promesse rejetée parte dans le
 * gestionnaire d'erreurs (Express 4 n'attrape pas les rejets async).
 */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}
