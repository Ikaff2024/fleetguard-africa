import { isDatabaseEnabled, withTenant } from '../db/prisma.js';

/**
 * Fiche chauffeur rattachée à un compte utilisateur.
 *
 * Le lien est lu côté serveur, jamais transmis par l'appelant : c'est lui qui
 * garantit qu'un conducteur émet sous son propre nom et pas sous celui d'un
 * collègue.
 */
export async function findDriverForUser(
  organizationId: string,
  userId: string,
): Promise<{ id: string; fullName: string } | null> {
  if (!isDatabaseEnabled()) return null;

  return withTenant(organizationId, async tx => {
    const driver = await tx.driver.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true, fullName: true },
    });
    return driver ?? null;
  });
}
