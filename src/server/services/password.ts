import { type ScryptOptions, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * `promisify(scrypt)` perd la surcharge acceptant des options : on enveloppe
 * l'appel à la main pour conserver un typage exact.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => (err ? reject(err) : resolve(derivedKey)));
  });
}

/**
 * Hachage des mots de passe par scrypt.
 *
 * scrypt est retenu plutôt que bcrypt parce qu'il est *memory-hard* : le coût
 * d'une attaque par GPU ou ASIC croît avec la mémoire requise, pas seulement
 * avec le temps de calcul. Il est fourni nativement par Node, ce qui évite une
 * dépendance à compiler — un point qui compte pour des déploiements simples.
 *
 * Paramètres conformes aux recommandations OWASP (N=2^16, r=8, p=1).
 */
const SCRYPT_N = 65_536;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Format stocké : `scrypt$N$r$p$sel$condensé` — les paramètres voyagent avec le hachage. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    // Sans cette marge, Node refuse les paramètres OWASP par dépassement mémoire.
    maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
  });

  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), derived.toString('base64')].join(
    '$',
  );
}

/**
 * Vérifie un mot de passe.
 * La comparaison est à temps constant : une comparaison naïve laisserait fuir
 * la longueur du préfixe correct par mesure du temps de réponse.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(saltB64!, 'base64');
  const expected = Buffer.from(hashB64!, 'base64');

  try {
    const derived = await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Politique de mot de passe.
 * Volontairement centrée sur la longueur : une exigence de caractères spéciaux
 * pousse surtout à des variantes prévisibles du même mot de passe.
 */
export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (password.length < 12) {
    return { valid: false, reason: 'Le mot de passe doit comporter au moins 12 caractères.' };
  }
  if (password.length > 200) {
    return { valid: false, reason: 'Le mot de passe ne peut pas dépasser 200 caractères.' };
  }
  return { valid: true };
}
