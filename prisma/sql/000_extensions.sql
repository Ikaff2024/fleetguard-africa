-- ============================================================================
-- Extensions PostgreSQL requises
-- ============================================================================
--
-- Appliqué en premier par le script de démarrage.
--
-- En développement, ces extensions sont créées par docker/postgres-init. En
-- production, la base est fournie par l'hébergeur : rien ne garantit qu'elles
-- soient présentes. Sans `pg_trgm`, la création des index de recherche échoue
-- (« operator class gin_trgm_ops does not exist ») et la préparation de la
-- base s'interrompt.
--
-- `IF NOT EXISTS` rend le script rejouable à chaque démarrage.
--
-- Note d'exploitation : sur une base managée où le compte applicatif n'a pas
-- le droit de créer des extensions, ces ordres doivent être passés une fois
-- par l'administrateur. Le script échouera alors explicitement, avec le nom de
-- l'extension manquante.

-- Géométries : geofences, corridors, points GPS.
CREATE EXTENSION IF NOT EXISTS postgis;

-- Identifiants opaques (gen_random_uuid).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Recherche tolérante aux fautes sur les immatriculations et les noms.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
