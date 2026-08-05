import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';

/**
 * Tests automatiques d'isolation des tenants.
 *
 * Exigence explicite du cahier des charges : « les tests démontrent qu'un
 * tenant ne peut pas lire les données d'un autre ».
 *
 * Ces tests s'exécutent contre une base réelle, avec des comptes réels, parce
 * que c'est le seul moyen de vérifier ce qui compte : que le Row-Level
 * Security PostgreSQL filtre effectivement. Un test sur données en mémoire
 * validerait le filtrage applicatif, pas la défense en profondeur.
 *
 * Prérequis : `npm run infra:up`, `npm run db:migrate`, `npm run db:seed`,
 * puis application de prisma/sql/001 à 003. Sans `DATABASE_APP_URL`, la suite
 * est ignorée plutôt que de produire un faux succès.
 */

const DATABASE_CONFIGURED = Boolean(process.env.DATABASE_APP_URL && process.env.JWT_SECRET);

const PASSWORD = process.env.SEED_PASSWORD ?? 'FleetGuard2026!Demo';
const TENANT_A_USER = 'manager@transafrik.bj';
const TENANT_B_USER = 'manager@sahelexpress.sn';
const TECHNICIAN = 'atelier@transafrik.bj';

let app: Express;

async function tokenFor(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status, `connexion de ${email} : ${JSON.stringify(res.body)}`).toBe(200);
  return res.body.data.accessToken;
}

describe.skipIf(!DATABASE_CONFIGURED)('Isolation des tenants (base réelle)', () => {
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    app = await createApp();
    tokenA = await tokenFor(TENANT_A_USER);
    tokenB = await tokenFor(TENANT_B_USER);
  });

  it('sert à chaque organisation un parc distinct', async () => {
    const [a, b] = await Promise.all([
      request(app).get('/api/v1/vehicles').set('Authorization', `Bearer ${tokenA}`),
      request(app).get('/api/v1/vehicles').set('Authorization', `Bearer ${tokenB}`),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.data.length).toBeGreaterThan(0);
    expect(b.body.data.length).toBeGreaterThan(0);

    const platesA = new Set(a.body.data.map((v: { immatriculation: string }) => v.immatriculation));
    const platesB = b.body.data.map((v: { immatriculation: string }) => v.immatriculation);

    // Aucune immatriculation commune : les deux parcs sont disjoints.
    for (const plate of platesB) {
      expect(platesA.has(plate), `${plate} visible par les deux organisations`).toBe(false);
    }
  });

  it('ne laisse fuir aucune ligne d’une autre organisation, sur aucune ressource', async () => {
    const routes = ['/api/v1/vehicles', '/api/v1/drivers', '/api/v1/maintenance', '/api/v1/fuel'];

    for (const route of routes) {
      const [a, b] = await Promise.all([
        request(app).get(route).set('Authorization', `Bearer ${tokenA}`),
        request(app).get(route).set('Authorization', `Bearer ${tokenB}`),
      ]);

      const orgA: string = a.body.data[0]?.organizationId;
      const orgB: string = b.body.data[0]?.organizationId;
      if (!orgA || !orgB) continue;

      expect(orgA, route).not.toBe(orgB);
      for (const row of a.body.data) expect(row.organizationId, route).toBe(orgA);
      for (const row of b.body.data) expect(row.organizationId, route).toBe(orgB);
    }
  });

  it('refuse l’accès à un chauffeur d’une autre organisation, même par identifiant direct', async () => {
    const driversA = await request(app).get('/api/v1/drivers').set('Authorization', `Bearer ${tokenA}`);
    const targetId = driversA.body.data[0].id;

    // Le tenant A y accède…
    const allowed = await request(app)
      .get(`/api/v1/scoring/drivers/${targetId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(allowed.status).toBe(200);

    // …le tenant B, non, alors qu'il connaît l'identifiant exact.
    const denied = await request(app)
      .get(`/api/v1/scoring/drivers/${targetId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(denied.status).toBe(404);
    expect(denied.body).not.toHaveProperty('data');
  });

  it('rejette toute requête non authentifiée', async () => {
    for (const route of ['/api/v1/vehicles', '/api/v1/drivers', '/api/v1/maintenance']) {
      const res = await request(app).get(route);
      expect(res.status, route).toBe(401);
    }
  });

  it('ignore un en-tête X-Organization-Id contredisant le jeton', async () => {
    // L'ancien mécanisme déclaratif ne doit plus avoir aucun effet : le tenant
    // vient du jeton signé, et lui seul.
    const usurped = await request(app)
      .get('/api/v1/vehicles')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Organization-Id', 'org_transafrik_cotonou');

    const legitimate = await request(app).get('/api/v1/vehicles').set('Authorization', `Bearer ${tokenB}`);

    expect(usurped.status).toBe(200);
    expect(usurped.body.data).toEqual(legitimate.body.data);
  });

  it('rejette un jeton falsifié', async () => {
    const [header, payload] = tokenA.split('.');
    const forged = `${header}.${payload}.signature-inventee`;

    const res = await request(app).get('/api/v1/vehicles').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!DATABASE_CONFIGURED)('Contrôle d’accès par rôle', () => {
  let technicianToken: string;

  beforeAll(async () => {
    app = await createApp();
    technicianToken = await tokenFor(TECHNICIAN);
  });

  it('autorise le technicien sur la maintenance', async () => {
    const res = await request(app)
      .get('/api/v1/maintenance')
      .set('Authorization', `Bearer ${technicianToken}`);
    expect(res.status).toBe(200);
  });

  it('refuse au technicien la liste des chauffeurs', async () => {
    const res = await request(app).get('/api/v1/drivers').set('Authorization', `Bearer ${technicianToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});

describe.skipIf(!DATABASE_CONFIGURED)('Cycle de vie des sessions', () => {
  beforeAll(async () => {
    app = await createApp();
  });

  it('refuse un mot de passe erroné sans révéler si le compte existe', async () => {
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'inconnu@nulle-part.bj', password: 'peu-importe-12345' });
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TENANT_A_USER, password: 'mauvais-mot-de-passe' });

    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    // Message rigoureusement identique : aucune énumération possible.
    expect(unknown.body.message).toBe(wrongPassword.body.message);
  });

  it('renouvelle la session et invalide l’ancien jeton (rotation)', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TENANT_A_USER, password: PASSWORD });
    const firstRefresh: string = login.body.data.refreshToken;

    const renewed = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: firstRefresh });
    expect(renewed.status).toBe(200);
    expect(renewed.body.data.refreshToken).not.toBe(firstRefresh);

    // Rejouer l'ancien jeton doit échouer : c'est la détection de vol.
    const replay = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: firstRefresh });
    expect(replay.status).toBe(401);
  });

  it('révoque la session à la déconnexion', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TENANT_A_USER, password: PASSWORD });
    const refreshToken: string = login.body.data.refreshToken;

    await request(app).post('/api/v1/auth/logout').send({ refreshToken }).expect(204);

    const afterLogout = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(afterLogout.status).toBe(401);
  });
});
