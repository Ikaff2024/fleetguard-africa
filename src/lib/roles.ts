/**
 * Libellés métier des rôles.
 *
 * L'interface ne doit jamais afficher les identifiants techniques
 * (`MAINTENANCE_TECH`) : ils sont destinés au code, pas au gestionnaire de
 * flotte qui lit son écran.
 */
export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Administrateur plateforme',
  ORGANIZATION_ADMIN: 'Administrateur',
  FLEET_MANAGER: 'Gestionnaire de flotte',
  SAFETY_OFFICER: 'Responsable sécurité',
  MAINTENANCE_TECH: 'Technicien maintenance',
  DRIVER: 'Chauffeur',
};

export function roleLabel(role: string | undefined): string {
  if (!role) return 'Utilisateur';
  return ROLE_LABELS[role] ?? role;
}

/** Initiales d'un nom complet, pour la pastille d'avatar. */
export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('');
}
