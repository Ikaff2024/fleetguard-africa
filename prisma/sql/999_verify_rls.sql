-- ============================================================================
-- Vérification de l'isolation multi-tenant
-- ============================================================================
--
-- À exécuter après chaque déploiement de migration, et en préproduction avant
-- toute mise en production. Une politique RLS silencieusement inactive ne se
-- voit pas : l'application fonctionne normalement, et les données fuient.
--
-- Usage :
--   psql -U fleetguard -d fleetguard_db -v ON_ERROR_STOP=1 -f 999_verify_rls.sql
--
-- Le script échoue bruyamment si l'isolation n'est pas effective.

\echo ''
\echo '=== Vérification de l''isolation multi-tenant ==='
\echo ''

DO $$
DECLARE
  org_a uuid;
  org_b uuid;
  visible_without_tenant int;
  visible_for_a int;
  visible_for_b int;
  total_vehicles int;
  cross_tenant_insert_blocked boolean := false;
BEGIN
  SELECT id INTO org_a FROM organizations ORDER BY code LIMIT 1;
  SELECT id INTO org_b FROM organizations WHERE id <> org_a ORDER BY code LIMIT 1;

  IF org_a IS NULL OR org_b IS NULL THEN
    RAISE EXCEPTION 'Il faut au moins deux organisations pour vérifier l''isolation. Lancez le seed.';
  END IF;

  SELECT count(*) INTO total_vehicles FROM vehicles;

  -- Le rôle applicatif est soumis au RLS ; le propriétaire des tables ne l'est
  -- pas, d'où le changement de rôle.
  SET LOCAL ROLE fleetguard_app;

  -- 1. Sans tenant défini, rien ne doit être visible.
  PERFORM set_config('app.current_organization_id', '', true);
  SELECT count(*) INTO visible_without_tenant FROM vehicles;

  IF visible_without_tenant <> 0 THEN
    RAISE EXCEPTION 'ÉCHEC : % véhicules visibles sans tenant défini. Le RLS ne protège rien.', visible_without_tenant;
  END IF;
  RAISE NOTICE '  [OK] Sans tenant : 0 ligne visible';

  -- 2. Chaque tenant ne voit que ses propres lignes.
  PERFORM set_config('app.current_organization_id', org_a::text, true);
  SELECT count(*) INTO visible_for_a FROM vehicles;

  PERFORM set_config('app.current_organization_id', org_b::text, true);
  SELECT count(*) INTO visible_for_b FROM vehicles;

  IF visible_for_a + visible_for_b > total_vehicles THEN
    RAISE EXCEPTION 'ÉCHEC : recouvrement entre tenants (% + % > %)', visible_for_a, visible_for_b, total_vehicles;
  END IF;

  IF visible_for_a = total_vehicles THEN
    RAISE EXCEPTION 'ÉCHEC : le tenant A voit la totalité du parc (% lignes)', total_vehicles;
  END IF;

  RAISE NOTICE '  [OK] Tenant A : % véhicules / Tenant B : % véhicules / total base : %',
    visible_for_a, visible_for_b, total_vehicles;

  -- 3. Écriture au nom d'un autre tenant : doit être refusée par WITH CHECK.
  PERFORM set_config('app.current_organization_id', org_a::text, true);
  BEGIN
    INSERT INTO vehicles (
      id, "organizationId", immatriculation, vin, make, model, year, type, "fuelType",
      "tankCapacityLiters", "expectedConsumptionL100km", "currentOdometerKm", status,
      "createdAt", "updatedAt"
    )
    VALUES (
      gen_random_uuid(), org_b, 'TEST-RLS-000', 'TESTVIN0000000000', 'Test', 'Test', 2026,
      'HEAVY_TRUCK', 'DIESEL', 100, 30, 0, 'ACTIVE', now(), now()
    );
    -- Si l'insertion passe, la politique d'écriture est absente.
  EXCEPTION
    WHEN insufficient_privilege THEN
      cross_tenant_insert_blocked := true;
  END;

  IF NOT cross_tenant_insert_blocked THEN
    RAISE EXCEPTION 'ÉCHEC : un tenant a pu insérer une ligne au nom d''un autre tenant.';
  END IF;
  RAISE NOTICE '  [OK] Écriture au nom d''un autre tenant : refusée';

  RESET ROLE;

  RAISE NOTICE '';
  RAISE NOTICE 'Isolation multi-tenant vérifiée.';
END
$$;
