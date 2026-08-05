import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { env } from '../env.js';
import { ApiError } from '../http/errors.js';

/**
 * Jetons d'accès et de rafraîchissement.
 *
 * Deux durées de vie distinctes :
 *   - accès : 15 minutes, porté par chaque requête. Court, car il ne peut pas
 *     être révoqué avant son expiration.
 *   - rafraîchissement : 30 jours, stocké en base sous forme de condensé et
 *     révocable à tout instant.
 *
 * Le tenant et le rôle voyagent dans le jeton **signé**. C'est ce qui remplace
 * l'en-tête `X-Organization-Id`, qui n'était qu'une déclaration du client.
 */

const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL_DAYS = 30;
const ISSUER = 'fleetguard-africa';
const AUDIENCE = 'fleetguard-api';

function secretKey(): Uint8Array {
  if (!env.JWT_SECRET) {
    throw new ApiError(500, "JWT_SECRET n'est pas configuré : l'authentification est indisponible.");
  }
  return new TextEncoder().encode(env.JWT_SECRET);
}

export const accessTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  organizationId: z.string().min(1),
  role: z.enum([
    'SUPER_ADMIN',
    'ORGANIZATION_ADMIN',
    'FLEET_MANAGER',
    'SAFETY_OFFICER',
    'MAINTENANCE_TECH',
    'DRIVER',
  ]),
  email: z.string(),
});

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({
    organizationId: claims.organizationId,
    role: claims.role,
    email: claims.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const parsed = accessTokenClaimsSchema.safeParse(payload);
    if (!parsed.success) {
      throw ApiError.unauthorized('Jeton invalide.');
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Message identique pour un jeton expiré, malformé ou mal signé : détailler
    // la cause aide surtout un attaquant à cerner ce qu'il doit corriger.
    throw ApiError.unauthorized('Session expirée ou jeton invalide.');
  }
}

/**
 * Jeton de rafraîchissement : valeur aléatoire opaque, pas un JWT.
 * Seul son condensé est stocké — une fuite de la table ne livre aucun jeton
 * réutilisable.
 */
export function generateRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(48).toString('base64url');
  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

export function hashRefreshToken(token: string): string {
  // SHA-256 suffit : la valeur d'entrée est déjà 384 bits d'aléa, une attaque
  // par dictionnaire n'a aucun sens ici.
  return createHash('sha256').update(token).digest('hex');
}
