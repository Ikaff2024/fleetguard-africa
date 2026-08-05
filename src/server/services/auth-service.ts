import { db, isDatabaseEnabled, withTenant } from '../db/prisma.js';
import { ApiError } from '../http/errors.js';
import type { Role } from '../http/rbac.js';
import { logger } from '../logger.js';
import { verifyPassword } from './password.js';
import { REFRESH_TOKEN_TTL_DAYS, generateRefreshToken, hashRefreshToken, signAccessToken } from './tokens.js';

/**
 * Connexion, rotation de session et déconnexion.
 *
 * Les deux lectures qui précèdent l'établissement du contexte tenant passent
 * par des fonctions SQL à privilèges contrôlés (voir 003_auth_functions.sql) :
 * on ne peut pas filtrer par organisation une requête dont le but est
 * justement de découvrir l'organisation. Toutes les écritures qui suivent sont
 * faites dans le contexte du tenant, donc soumises au Row-Level Security.
 */

/** Verrouillage après échecs répétés : ralentit la force brute sans bloquer durablement un utilisateur légitime. */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AuthenticatedSession {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    organizationId: string;
    organizationName: string;
  };
}

interface AuthUserRow {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  role: string;
  passwordHash: string;
  isActive: boolean;
  deletedAt: Date | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  tokensValidFrom: Date;
  organizationName: string;
  organizationActive: boolean;
}

interface RefreshTokenRow {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  createdAt: Date;
  organizationId: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  deletedAt: Date | null;
  tokensValidFrom: Date;
  organizationName: string;
  organizationActive: boolean;
}

function ensureDatabase() {
  if (!isDatabaseEnabled()) {
    throw ApiError.serviceUnavailable(
      "L'authentification requiert une base de données. Renseignez DATABASE_URL et appliquez les migrations.",
      'AUTH_UNAVAILABLE',
    );
  }
}

/**
 * Condensé factice, utilisé quand le compte n'existe pas.
 * Le temps de réponse reste alors comparable à celui d'un mot de passe erroné :
 * sans cela, la différence de latence permet d'énumérer les comptes valides.
 */
const DUMMY_HASH =
  'scrypt$65536$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function login(
  email: string,
  password: string,
  context: { ipAddress?: string; userAgent?: string },
): Promise<AuthenticatedSession> {
  ensureDatabase();

  const normalizedEmail = email.trim().toLowerCase();

  const rows = await db().$queryRaw<AuthUserRow[]>`
    SELECT * FROM auth_find_user_by_email(${normalizedEmail})
  `;
  const user = rows[0];

  // Message unique quel que soit le motif : distinguer « compte inconnu » de
  // « mot de passe incorrect » permettrait d'énumérer les comptes existants.
  const invalidCredentials = () => ApiError.unauthorized('Identifiants incorrects.');

  if (!user || !user.isActive || user.deletedAt) {
    await verifyPassword(password, DUMMY_HASH);
    throw invalidCredentials();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw ApiError.unauthorized(
      'Compte temporairement verrouillé après plusieurs tentatives. Réessayez dans quelques minutes.',
    );
  }

  if (!user.organizationActive) {
    throw ApiError.forbidden('Cette organisation est désactivée. Contactez votre administrateur.');
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);

  if (!passwordValid) {
    const failedCount = user.failedLoginCount + 1;
    await withTenant(user.organizationId, tx =>
      tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failedCount,
          lockedUntil:
            failedCount >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
        },
      }),
    );

    logger.warn({ email: normalizedEmail, failedCount }, 'Échec de connexion');
    throw invalidCredentials();
  }

  await withTenant(user.organizationId, tx =>
    tx.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    }),
  );

  return issueSession(
    {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as Role,
      organizationId: user.organizationId,
      organizationName: user.organizationName,
    },
    context,
  );
}

/**
 * Rotation du jeton de rafraîchissement.
 *
 * La réutilisation d'un jeton déjà tourné signale un vol : toutes les sessions
 * de l'utilisateur sont alors révoquées, plutôt que de laisser coexister la
 * session légitime et celle de l'attaquant.
 */
export async function refreshSession(
  refreshToken: string,
  context: { ipAddress?: string; userAgent?: string },
): Promise<AuthenticatedSession> {
  ensureDatabase();

  const tokenHash = hashRefreshToken(refreshToken);

  const rows = await db().$queryRaw<RefreshTokenRow[]>`
    SELECT * FROM auth_find_refresh_token(${tokenHash})
  `;
  const stored = rows[0];

  if (!stored) {
    throw ApiError.unauthorized('Session invalide. Reconnectez-vous.');
  }

  if (stored.revokedAt || stored.replacedById) {
    logger.error(
      { userId: stored.userId },
      'Réutilisation d’un jeton de rafraîchissement révoqué — révocation de toutes les sessions',
    );
    await withTenant(stored.organizationId, tx =>
      tx.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
    throw ApiError.unauthorized('Session compromise. Reconnectez-vous.');
  }

  if (stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Session expirée. Reconnectez-vous.');
  }

  if (!stored.isActive || stored.deletedAt || !stored.organizationActive) {
    throw ApiError.forbidden('Compte ou organisation désactivé.');
  }

  // Un changement de mot de passe invalide les sessions antérieures.
  if (stored.createdAt < stored.tokensValidFrom) {
    throw ApiError.unauthorized('Session invalidée. Reconnectez-vous.');
  }

  const session = await issueSession(
    {
      id: stored.userId,
      email: stored.email,
      fullName: stored.fullName,
      role: stored.role as Role,
      organizationId: stored.organizationId,
      organizationName: stored.organizationName,
    },
    context,
  );

  // L'ancien jeton est marqué comme remplacé : c'est ce lien qui permet de
  // détecter un rejeu ultérieur.
  await withTenant(stored.organizationId, async tx => {
    const replacement = await tx.refreshToken.findFirst({
      where: { tokenHash: hashRefreshToken(session.refreshToken) },
    });
    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: replacement?.id },
    });
  });

  return session;
}

export async function logout(refreshToken: string): Promise<void> {
  if (!isDatabaseEnabled()) return;

  const tokenHash = hashRefreshToken(refreshToken);
  const rows = await db().$queryRaw<RefreshTokenRow[]>`
    SELECT * FROM auth_find_refresh_token(${tokenHash})
  `;
  const stored = rows[0];
  if (!stored) return;

  await withTenant(stored.organizationId, tx =>
    tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  );
}

/** Révoque toutes les sessions d'un utilisateur (changement de mot de passe, départ). */
export async function revokeAllSessions(organizationId: string, userId: string): Promise<void> {
  ensureDatabase();
  await withTenant(organizationId, tx =>
    tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  );
}

async function issueSession(
  user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    organizationId: string;
    organizationName: string;
  },
  context: { ipAddress?: string; userAgent?: string },
): Promise<AuthenticatedSession> {
  const accessToken = await signAccessToken({
    sub: user.id,
    organizationId: user.organizationId,
    role: user.role,
    email: user.email,
  });

  const refresh = generateRefreshToken();

  await withTenant(user.organizationId, async tx => {
    await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refresh.tokenHash,
        expiresAt: refresh.expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    // Ménage opportuniste : évite l'accumulation indéfinie de jetons morts.
    await tx.refreshToken.deleteMany({
      where: {
        userId: user.id,
        expiresAt: { lt: new Date(Date.now() - REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000) },
      },
    });
  });

  return {
    accessToken,
    refreshToken: refresh.token,
    expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: user.organizationName,
    },
  };
}
