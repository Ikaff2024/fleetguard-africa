-- ============================================================================
-- Géométries PostGIS, index spatiaux et partitionnement de la télémétrie
-- ============================================================================
--
-- À appliquer après 001_rls_policies.sql.

-- ---------------------------------------------------------------------------
-- 1. Alimentation automatique des colonnes géographiques
-- ---------------------------------------------------------------------------
-- L'application écrit latitude/longitude ; la colonne `location` est dérivée
-- par trigger. Ainsi une insertion faite hors du chemin nominal (import,
-- reprise de données, script d'exploitation) ne peut pas produire une ligne
-- sans géométrie, invisible du moteur de geofencing.

CREATE OR REPLACE FUNCTION sync_location_from_latlng()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude::float8, NEW.latitude::float8), 4326)::geography;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS gps_points_sync_location ON public.gps_points;
CREATE TRIGGER gps_points_sync_location
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.gps_points
  FOR EACH ROW EXECUTE FUNCTION sync_location_from_latlng();

DROP TRIGGER IF EXISTS safety_events_sync_location ON public.safety_events;
CREATE TRIGGER safety_events_sync_location
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.safety_events
  FOR EACH ROW EXECUTE FUNCTION sync_location_from_latlng();

-- ---------------------------------------------------------------------------
-- 2. Index spatiaux
-- ---------------------------------------------------------------------------
-- Sans index GIST, chaque test d'appartenance à une geofence balaie la table
-- entière. À 43 millions de points par mois, la différence n'est pas une
-- optimisation : c'est ce qui rend la fonctionnalité possible ou non.

CREATE INDEX IF NOT EXISTS gps_points_location_idx
  ON public.gps_points USING GIST (location);

CREATE INDEX IF NOT EXISTS safety_events_location_idx
  ON public.safety_events USING GIST (location);

CREATE INDEX IF NOT EXISTS geofences_area_idx
  ON public.geofences USING GIST (area);

-- Recherche d'immatriculation tolérante aux fautes de frappe du régulateur.
CREATE INDEX IF NOT EXISTS vehicles_immat_trgm_idx
  ON public.vehicles USING GIN (immatriculation gin_trgm_ops);

CREATE INDEX IF NOT EXISTS drivers_fullname_trgm_idx
  ON public.drivers USING GIN ("fullName" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. Cercle de geofence → polygone
-- ---------------------------------------------------------------------------
-- Un cercle est stocké comme le tampon de son centre : le moteur n'a qu'un
-- seul type de géométrie à interroger, et un seul chemin de code à maintenir.

CREATE OR REPLACE FUNCTION sync_geofence_area()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."centerLat" IS NOT NULL AND NEW."centerLng" IS NOT NULL AND NEW."radiusMeters" IS NOT NULL THEN
    NEW.area := ST_Buffer(
      ST_SetSRID(ST_MakePoint(NEW."centerLng"::float8, NEW."centerLat"::float8), 4326)::geography,
      NEW."radiusMeters"
    )::geography;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS geofences_sync_area ON public.geofences;
CREATE TRIGGER geofences_sync_area
  BEFORE INSERT OR UPDATE OF "centerLat", "centerLng", "radiusMeters" ON public.geofences
  FOR EACH ROW EXECUTE FUNCTION sync_geofence_area();

-- ---------------------------------------------------------------------------
-- 4. Partitionnement mensuel de la télémétrie
-- ---------------------------------------------------------------------------
-- Volumétrie de référence : 500 véhicules × 8 h de roulage × 1 point/10 s
-- ≈ 43 millions de lignes et ~15 Go par mois.
--
-- Sans partitionnement, la purge des données anciennes est un DELETE massif :
-- verrouillage prolongé, explosion du WAL, index à reconstruire. Avec des
-- partitions, purger un mois revient à détacher une table — opération
-- instantanée. C'est aussi ce qui rend tenable une politique de rétention
-- opposable en matière de protection des données personnelles.
--
-- NOTE : Prisma Migrate ne génère pas de tables partitionnées. La bascule se
-- fait ici, avant la mise en service (table encore vide).

CREATE OR REPLACE FUNCTION create_gps_partition(target_month date)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  partition_name text := 'gps_points_' || to_char(target_month, 'YYYY_MM');
  start_date date := date_trunc('month', target_month)::date;
  end_date date := (date_trunc('month', target_month) + interval '1 month')::date;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE TABLE public.%I PARTITION OF public.gps_points FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_date, end_date
  );

  RAISE NOTICE 'Partition % créée (% → %)', partition_name, start_date, end_date;
END
$$;

-- Purge des partitions au-delà de la durée de rétention.
-- Les traces brutes ne sont pas conservées indéfiniment : au-delà de la
-- fenêtre d'exploitation, seuls les agrégats journaliers ont une utilité, et
-- une conservation sans limite serait indéfendable au regard des lois de
-- protection des données (APDP Bénin, ARTCI Côte d'Ivoire, NDPR Nigeria,
-- Kenya DPA 2019).
CREATE OR REPLACE FUNCTION drop_old_gps_partitions(retention_months int DEFAULT 3)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  partition record;
  cutoff date := (date_trunc('month', now()) - (retention_months || ' months')::interval)::date;
BEGIN
  FOR partition IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname ~ '^gps_points_[0-9]{4}_[0-9]{2}$'
      AND to_date(right(c.relname, 7), 'YYYY_MM') < cutoff
  LOOP
    EXECUTE format('DROP TABLE public.%I', partition.relname);
    RAISE NOTICE 'Partition purgée : %', partition.relname;
  END LOOP;
END
$$;
