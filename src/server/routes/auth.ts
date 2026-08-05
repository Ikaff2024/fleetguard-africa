import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { isDatabaseEnabled, withTenant } from '../db/prisma.js';
import { requireAuth, requireAuthContext } from '../http/auth.js';
import { ApiError, asyncHandler } from '../http/errors.js';
import { ROLE_PERMISSIONS } from '../http/rbac.js';
import { recordAudit } from '../services/audit.js';
import { login, logout, refreshSession } from '../services/auth-service.js';

export const authRouter = Router();

/**
 * Limiteur dédié à la connexion.
 *
 * Beaucoup plus strict que le limiteur global : la connexion est la porte
 * d'entrée d'une attaque par force brute, et sa fréquence légitime est faible.
 */
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Les tentatives réussies ne consomment pas le quota.
  skipSuccessfulRequests: true,
  handler: () => {
    throw new ApiError(
      429,
      'Trop de tentatives de connexion. Réessayez dans quelques minutes.',
      'LOGIN_RATE_LIMITED',
    );
  },
});

const loginSchema = z.object({
  email: z.string().trim().min(3).max(255),
  password: z.string().min(1).max(200),
});

authRouter.post(
  '/auth/login',
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body ?? {});

    const session = await login(email, password, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await recordAudit(
      {
        organizationId: session.user.organizationId,
        userId: session.user.id,
        userEmail: session.user.email,
        action: 'USER_LOGIN',
        resource: 'session',
      },
      req,
    );

    res.json({ statusCode: 200, data: session });
  }),
);

const refreshSchema = z.object({
  refreshToken: z.string().min(10).max(500),
});

authRouter.post(
  '/auth/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body ?? {});

    const session = await refreshSession(refreshToken, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ statusCode: 200, data: session });
  }),
);

authRouter.post(
  '/auth/logout',
  asyncHandler(async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body ?? {});
    if (parsed.success) {
      await logout(parsed.data.refreshToken);
    }
    // Toujours 204 : une déconnexion ne doit jamais échouer côté client, même
    // si le jeton était déjà invalide.
    res.status(204).end();
  }),
);

/** Profil courant, permissions comprises : l'interface s'y adapte sans deviner. */
authRouter.get(
  '/auth/me',
  // Ce contrôle précède la vérification du jeton, et c'est délibéré : sans
  // base de données, aucun compte n'existe et l'interface doit pouvoir
  // distinguer « session absente » (il faut se connecter) de « serveur sans
  // base » (mode démonstration). Un 401 rendrait ces deux cas indiscernables.
  (_req, _res, next) => {
    if (!isDatabaseEnabled()) {
      return next(
        ApiError.serviceUnavailable(
          "Aucune base de données n'est configurée : l'authentification est indisponible.",
          'AUTH_UNAVAILABLE',
        ),
      );
    }
    next();
  },
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = requireAuthContext(req);

    const user = await withTenant(auth.organizationId, tx =>
      tx.user.findFirst({
        where: { id: auth.userId },
        include: { organization: true },
      }),
    );

    if (!user || !user.isActive || user.deletedAt) {
      throw ApiError.unauthorized('Compte introuvable ou désactivé.');
    }

    res.json({
      statusCode: 200,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        avatarUrl: user.avatarUrl,
        permissions: ROLE_PERMISSIONS[auth.role],
        organization: {
          id: user.organization.id,
          name: user.organization.name,
          code: user.organization.code,
          country: user.organization.country,
          currency: user.organization.currency,
          timezone: user.organization.timezone,
        },
      },
    });
  }),
);
