import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';

/**
 * Identifiants passés dans l'URL.
 *
 * Quinze routes transmettaient `req.params.id` directement à la base. Un
 * identifiant mal formé atteignait PostgreSQL, qui refusait la conversion en
 * UUID : l'API répondait **500** là où la réponse honnête est « cette ressource
 * n'existe pas ».
 *
 * Le défaut s'est révélé par accident — un test dont une variable valait
 * `undefined` a produit `/vehicles/undefined` et une panne serveur au lieu d'un
 * 404. Ce qu'un test a trouvé par hasard, une sonde automatisée le trouve en
 * quelques minutes.
 */

const DATABASE_CONFIGURED = Boolean(process.env.DATABASE_APP_URL && process.env.JWT_SECRET);
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FleetGuard2026!Demo';

let app: Express;
let token: string;

/**
 * Formes malformées rencontrées en vrai : une variable non initialisée, un
 * identifiant tronqué par un copier-coller, une valeur numérique, et une
 * tentative d'injection.
 */
const MALFORMED = ['undefined', 'null', '12345', 'abc-def', "1' OR '1'='1", '../../etc/passwd'];

beforeAll(async () => {
  app = await createApp();
  if (DATABASE_CONFIGURED) {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@transafrik.bj', password: SEED_PASSWORD });
    token = res.body.data.accessToken;
  }
});

describe.runIf(DATABASE_CONFIGURED)('Identifiants de ressource malformés', () => {
  it('répond 404 plutôt que de tomber en panne', async () => {
    for (const bad of MALFORMED) {
      const res = await request(app)
        .patch(`/api/v1/vehicles/${encodeURIComponent(bad)}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'OUT_OF_SERVICE' });

      expect(res.status, `identifiant « ${bad} » : ${JSON.stringify(res.body)}`).toBe(404);
    }
  });

  it('protège aussi la lecture d’une trace et l’archivage', async () => {
    const track = await request(app)
      .get('/api/v1/tracking/vehicles/undefined/points')
      .set('Authorization', `Bearer ${token}`);
    expect(track.status).toBe(404);

    const archive = await request(app)
      .delete('/api/v1/vehicles/undefined')
      .set('Authorization', `Bearer ${token}`);
    expect(archive.status).toBe(404);
  });

  it('ne révèle pas que les identifiants sont des UUID', async () => {
    /**
     * Répondre 400 sur la forme et 404 sur l'existence indiquerait à qui sonde
     * l'API quel format attendre. Les deux cas doivent être indiscernables.
     */
    const malformed = await request(app)
      .patch('/api/v1/vehicles/pas-un-uuid')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'OUT_OF_SERVICE' });

    const wellFormedButAbsent = await request(app)
      .patch('/api/v1/vehicles/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'OUT_OF_SERVICE' });

    expect(malformed.status).toBe(wellFormedButAbsent.status);
  });

  it('n’expose jamais le détail technique de la base', async () => {
    // Un message d'erreur PostgreSQL renseigne sur le schéma : il ne doit pas
    // franchir la frontière de l'API.
    const res = await request(app)
      .patch('/api/v1/vehicles/undefined')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'OUT_OF_SERVICE' });

    const body = JSON.stringify(res.body).toLowerCase();
    for (const leak of ['uuid', 'postgres', 'prisma', 'syntax', 'invalid input']) {
      expect(body, `fuite « ${leak} »`).not.toContain(leak);
    }
  });
});
