-- ============================================================================
-- Isolation multi-tenant par Row-Level Security
-- ============================================================================
--
-- À appliquer après chaque `prisma migrate deploy` (voir README § Base de données).
--
-- POURQUOI CETTE COUCHE EXISTE
--
-- Filtrer par `organizationId` dans le code applicatif fonctionne — jusqu'au
-- jour où quelqu'un oublie une clause `where`. Ce jour-là, un client voit la
-- flotte d'un concurrent, et c'est la fin commerciale d'un SaaS B2B.
--
-- Le RLS déplace la garantie dans la base : même une requête sans filtre ne
-- renvoie que les lignes du tenant courant. Le code applicatif devient la
-- deuxième ligne de défense, plus la seule.
--
-- COMMENT L'APPLICATION S'EN SERT
--
-- Chaque requête s'exécute dans une transaction qui commence par :
--
--     SET LOCAL app.current_organization_id = '<uuid du tenant>';
--
-- `SET LOCAL` est indispensable : la valeur meurt avec la transaction et ne
-- fuit donc pas vers la requête suivante qui réutilisera la même connexion du
-- pool. Un `SET` simple laisserait le tenant précédent actif — exactement la
-- fuite que ce mécanisme cherche à empêcher.
--
-- L'UUID vient du JWT signé, jamais d'un paramètre de requête client.

-- ---------------------------------------------------------------------------
-- 1. Rôle applicatif
-- ---------------------------------------------------------------------------
-- Le rôle utilisé par l'application ne doit être ni superutilisateur ni
-- propriétaire des tables : PostgreSQL exempte ces deux catégories du RLS.
-- C'est l'erreur de configuration la plus fréquente — les politiques semblent
-- en place, et pourtant tout est visible.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fleetguard_app') THEN
    CREATE ROLE fleetguard_app LOGIN PASSWORD 'change_me_in_production' NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO fleetguard_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fleetguard_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fleetguard_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fleetguard_app;

-- ---------------------------------------------------------------------------
-- 2. Fonction d'accès au tenant courant
-- ---------------------------------------------------------------------------
-- `STABLE` autorise le planificateur à mémoriser le résultat sur la durée de la
-- requête. Sans cela, la fonction serait rappelée pour chaque ligne examinée.

CREATE OR REPLACE FUNCTION current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------------
-- 3. Politiques sur les tables porteuses d'organization_id
-- ---------------------------------------------------------------------------
-- Générées par balayage du catalogue : une table métier ajoutée plus tard sans
-- politique serait un trou de sécurité silencieux. Relancer ce script après
-- chaque migration ferme la brèche automatiquement.

DO $$
DECLARE
  target_table text;
BEGIN
  FOR target_table IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attname = 'organizationId'
      AND NOT a.attisdropped
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
    -- FORCE applique la politique y compris au propriétaire de la table :
    -- sans cela, les migrations et les scripts d'exploitation la contournent.
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target_table);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', target_table);

    -- USING filtre ce qui est lu, WITH CHECK ce qui est écrit : sans la
    -- seconde clause, un tenant pourrait insérer une ligne au nom d'un autre.
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I
         USING ("organizationId" = current_organization_id())
         WITH CHECK ("organizationId" = current_organization_id())',
      target_table
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Cas particuliers
-- ---------------------------------------------------------------------------

-- Une organisation ne voit qu'elle-même.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.organizations;
CREATE POLICY tenant_isolation ON public.organizations
  USING (id = current_organization_id())
  WITH CHECK (id = current_organization_id());

-- Les jetons de rafraîchissement suivent l'organisation de leur porteur.
ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refresh_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.refresh_tokens;
CREATE POLICY tenant_isolation ON public.refresh_tokens
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = refresh_tokens."userId"
        AND u."organizationId" = current_organization_id()
    )
  );

-- Les badges débloqués suivent l'organisation du chauffeur.
ALTER TABLE public.driver_unlocked_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_unlocked_badges FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.driver_unlocked_badges;
CREATE POLICY tenant_isolation ON public.driver_unlocked_badges
  USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = driver_unlocked_badges."driverId"
        AND d."organizationId" = current_organization_id()
    )
  );

-- Le catalogue de badges est commun à toutes les organisations : lecture pour
-- tous, écriture réservée à l'administration de la plateforme.
ALTER TABLE public.digital_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS badges_readable ON public.digital_badges;
CREATE POLICY badges_readable ON public.digital_badges FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- 5. Journal d'audit : insertion seule
-- ---------------------------------------------------------------------------
-- Un journal modifiable ne prouve rien. Ces politiques garantissent qu'une
-- trace, une fois écrite, ne peut être ni retouchée ni effacée par
-- l'application — y compris par un compte compromis.

DROP POLICY IF EXISTS tenant_isolation ON public.audit_logs;

CREATE POLICY audit_insert ON public.audit_logs
  FOR INSERT
  WITH CHECK ("organizationId" = current_organization_id());

CREATE POLICY audit_select ON public.audit_logs
  FOR SELECT
  USING ("organizationId" = current_organization_id());

REVOKE UPDATE, DELETE ON public.audit_logs FROM fleetguard_app;

-- ---------------------------------------------------------------------------
-- 6. Contrôle
-- ---------------------------------------------------------------------------
-- Aucune table métier ne doit apparaître dans ce résultat.

DO $$
DECLARE
  unprotected text[];
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname) INTO unprotected
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND a.attname = 'organizationId'
    AND NOT a.attisdropped
    AND NOT c.relrowsecurity;

  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'Tables sans RLS : %', array_to_string(unprotected, ', ');
  END IF;

  RAISE NOTICE 'RLS actif sur toutes les tables porteuses de organizationId.';
END
$$;
