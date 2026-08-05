import path from 'node:path';
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { defineConfig } from 'prisma/config';

/**
 * Configuration Prisma 7.
 *
 * Depuis la version 7, l'URL de connexion ne vit plus dans schema.prisma : elle
 * est fournie ici pour les migrations, et via l'adaptateur pour le client. Le
 * schéma reste ainsi exempt de toute référence à un environnement donné.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),

  // Utilisé par les commandes `prisma migrate` (shadow database comprise).
  // Le client applicatif, lui, passe par l'adaptateur ci-dessous.
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },

  migrations: {
    seed: 'tsx prisma/seed.ts',
  },

  adapter: async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL est absent. Lancez `npm run infra:up` puis copiez .env.example vers .env.',
      );
    }
    return new PrismaPg({ connectionString });
  },
});
