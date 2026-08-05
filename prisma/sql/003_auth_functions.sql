-- ============================================================================
-- Fonctions d'authentification
-- ============================================================================
--
-- À appliquer après 001_rls_policies.sql.
--
-- POURQUOI CES FONCTIONS EXISTENT
--
-- Le Row-Level Security filtre `users` sur l'organisation courante. Or
-- l'authentification se heurte à un paradoxe : pour trouver un utilisateur par
-- son adresse, il faudrait déjà connaître son organisation — que la connexion
-- est précisément en train d'établir.
--
-- Plutôt que d'assouplir la politique de la table (ce qui ouvrirait la lecture
-- de tous les comptes à toute requête sans contexte), on expose deux fonctions
-- `SECURITY DEFINER` au périmètre strictement délimité :
--   - elles ne servent qu'à la connexion et au rafraîchissement de session ;
--   - elles ne renvoient que les colonnes nécessaires à cette vérification ;
--   - elles ne donnent accès à aucune donnée métier.
--
-- `search_path` est figé sur chaque fonction : sans cela, un objet homonyme
-- créé dans un schéma prioritaire pourrait détourner l'exécution — l'attaque
-- classique contre les fonctions SECURITY DEFINER.

-- ---------------------------------------------------------------------------
-- 1. Recherche d'un compte par adresse e-mail
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auth_find_user_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  "organizationId" uuid,
  email text,
  "fullName" text,
  role text,
  "passwordHash" text,
  "isActive" boolean,
  "deletedAt" timestamp(3),
  "failedLoginCount" integer,
  "lockedUntil" timestamp(3),
  "tokensValidFrom" timestamp(3),
  "organizationName" text,
  "organizationActive" boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    u.id,
    u."organizationId",
    u.email,
    u."fullName",
    u.role::text,
    u."passwordHash",
    u."isActive",
    u."deletedAt",
    u."failedLoginCount",
    u."lockedUntil",
    u."tokensValidFrom",
    o.name,
    o."isActive"
  FROM public.users u
  JOIN public.organizations o ON o.id = u."organizationId"
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 2. Recherche d'un jeton de rafraîchissement par condensé
-- ---------------------------------------------------------------------------
-- Le paramètre est un condensé SHA-256 : il n'est pas devinable, et la
-- fonction ne révèle rien à qui ne détient pas déjà le jeton.

CREATE OR REPLACE FUNCTION auth_find_refresh_token(p_token_hash text)
RETURNS TABLE (
  id uuid,
  "userId" uuid,
  "expiresAt" timestamp(3),
  "revokedAt" timestamp(3),
  "replacedById" uuid,
  "createdAt" timestamp(3),
  "organizationId" uuid,
  email text,
  "fullName" text,
  role text,
  "isActive" boolean,
  "deletedAt" timestamp(3),
  "tokensValidFrom" timestamp(3),
  "organizationName" text,
  "organizationActive" boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    rt.id,
    rt."userId",
    rt."expiresAt",
    rt."revokedAt",
    rt."replacedById",
    rt."createdAt",
    u."organizationId",
    u.email,
    u."fullName",
    u.role::text,
    u."isActive",
    u."deletedAt",
    u."tokensValidFrom",
    o.name,
    o."isActive"
  FROM public.refresh_tokens rt
  JOIN public.users u ON u.id = rt."userId"
  JOIN public.organizations o ON o.id = u."organizationId"
  WHERE rt."tokenHash" = p_token_hash
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 3. Droits d'exécution
-- ---------------------------------------------------------------------------
-- Révocation à `PUBLIC` d'abord : par défaut, PostgreSQL accorde EXECUTE à
-- tout le monde sur une fonction nouvellement créée.

REVOKE ALL ON FUNCTION auth_find_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_find_refresh_token(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION auth_find_user_by_email(text) TO fleetguard_app;
GRANT EXECUTE ON FUNCTION auth_find_refresh_token(text) TO fleetguard_app;
