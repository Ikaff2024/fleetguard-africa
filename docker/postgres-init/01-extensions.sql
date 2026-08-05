-- Extensions requises, installées à la création du volume PostgreSQL.
-- Ce script ne s'exécute qu'une fois, lors de l'initialisation.

-- Géométries : geofences (cercles et polygones), corridors, calculs de distance.
CREATE EXTENSION IF NOT EXISTS postgis;

-- Identifiants opaques. Un identifiant séquentiel exposé dans une URL permet
-- d'énumérer les ressources et de mesurer l'activité d'un concurrent.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Recherche insensible aux accents et aux fautes sur les noms de chauffeurs
-- et les immatriculations.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Diagnostic des requêtes lentes en préproduction.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
