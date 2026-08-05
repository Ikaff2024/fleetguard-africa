import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './errors.js';

/**
 * Contrôle d'accès par rôle.
 *
 * La matrice est déclarée ici, en un seul endroit, plutôt que dispersée en
 * tests `if (role === …)` au fil des routes : une permission oubliée devient
 * visible à la relecture, et l'audit de sécurité se fait sur un seul fichier.
 *
 * Principe du moindre privilège : un rôle n'obtient que ce que son métier exige.
 * Un chauffeur consulte son propre score, il ne consulte pas la flotte entière.
 */

export type Role =
  'SUPER_ADMIN' | 'ORGANIZATION_ADMIN' | 'FLEET_MANAGER' | 'SAFETY_OFFICER' | 'MAINTENANCE_TECH' | 'DRIVER';

export type Permission =
  | 'fleet:read'
  | 'fleet:write'
  | 'drivers:read'
  | 'drivers:write'
  | 'tracking:read'
  | 'tracking:ingest'
  | 'scoring:read'
  | 'scoring:configure'
  | 'maintenance:read'
  | 'maintenance:write'
  | 'fuel:read'
  | 'fuel:write'
  | 'compliance:read'
  | 'compliance:write'
  | 'alerts:read'
  | 'alerts:acknowledge'
  | 'reports:read'
  | 'intelligence:use'
  | 'users:read'
  | 'users:write'
  | 'organization:configure'
  | 'audit:read';

const ALL_PERMISSIONS: Permission[] = [
  'fleet:read',
  'fleet:write',
  'drivers:read',
  'drivers:write',
  'tracking:read',
  'tracking:ingest',
  'scoring:read',
  'scoring:configure',
  'maintenance:read',
  'maintenance:write',
  'fuel:read',
  'fuel:write',
  'compliance:read',
  'compliance:write',
  'alerts:read',
  'alerts:acknowledge',
  'reports:read',
  'intelligence:use',
  'users:read',
  'users:write',
  'organization:configure',
  'audit:read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // Administration de la plateforme. Reste soumis au RLS : un super-admin agit
  // toujours dans le contexte d'une organisation donnée.
  SUPER_ADMIN: ALL_PERMISSIONS,

  ORGANIZATION_ADMIN: ALL_PERMISSIONS,

  // Pilote les opérations quotidiennes ; ne modifie ni les comptes ni les
  // paramètres de facturation de l'entreprise.
  FLEET_MANAGER: [
    'fleet:read',
    'fleet:write',
    'drivers:read',
    'drivers:write',
    'tracking:read',
    'scoring:read',
    'maintenance:read',
    'maintenance:write',
    'fuel:read',
    'fuel:write',
    'compliance:read',
    'compliance:write',
    'alerts:read',
    'alerts:acknowledge',
    'reports:read',
    'intelligence:use',
    'users:read',
  ],

  // Sécurité routière : lecture large, et seul habilité à modifier les
  // pondérations du score — c'est une décision de politique de sécurité.
  SAFETY_OFFICER: [
    'fleet:read',
    'drivers:read',
    'tracking:read',
    'scoring:read',
    'scoring:configure',
    'alerts:read',
    'alerts:acknowledge',
    'reports:read',
    'intelligence:use',
    'compliance:read',
  ],

  MAINTENANCE_TECH: [
    'fleet:read',
    'maintenance:read',
    'maintenance:write',
    'fuel:read',
    'compliance:read',
    'alerts:read',
  ],

  // Le chauffeur consulte son propre dossier — les routes concernées vérifient
  // en plus que la ressource lui appartient. C'est aussi lui, via l'application
  // mobile, qui remonte la télémétrie : `tracking:ingest` n'appartient donc pas
  // aux rôles de bureau. En Phase 2, les boîtiers GPS disposeront de leur
  // propre mécanisme d'identification d'appareil.
  DRIVER: ['scoring:read', 'alerts:read', 'fuel:write', 'compliance:read', 'tracking:ingest'],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Exige une permission ; à placer après `requireAuth`. */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) {
      return next(ApiError.unauthorized());
    }
    if (!roleHasPermission(auth.role, permission)) {
      return next(ApiError.forbidden(`Votre rôle (${auth.role}) ne permet pas cette action.`));
    }
    next();
  };
}
