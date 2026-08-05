import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { resetIdempotencyStore } from '../src/server/services/idempotency.js';

/**
 * Ces tests figent les garanties de sécurité de l'API.
 *
 * Ils portent sur ce qui coûte le plus cher à un SaaS B2B quand ça casse :
 * une organisation qui voit les données d'une autre, un score faussé par un
 * rejeu, une analyse inventée servie comme un fait.
 */

const TENANT_A = 'org_transafrik_cotonou';
const TENANT_B = 'org_sahel_express';
// Chauffeur appartenant au tenant A (jeu de démonstration).
const DRIVER_A = 'drv_moussa_04';
const VEHICLE_A = 'veh_actros_01';

let app: Express;

beforeAll(async () => {
  app = await createApp();
});

beforeEach(() => {
  resetIdempotencyStore();
});

describe('Résolution du tenant', () => {
  it('refuse une requête sans organisation', async () => {
    const res = await request(app).get('/api/v1/vehicles');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('refuse une organisation inconnue', async () => {
    const res = await request(app).get('/api/v1/vehicles').set('X-Organization-Id', 'org_inexistant');

    expect(res.status).toBe(403);
  });

  it('sert les véhicules du tenant demandé', async () => {
    const res = await request(app).get('/api/v1/vehicles').set('X-Organization-Id', TENANT_A);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const vehicle of res.body.data) {
      expect(vehicle.organizationId).toBe(TENANT_A);
    }
  });

  it("ne laisse fuir aucune donnée d'un autre tenant sur les listes", async () => {
    const routes = ['/api/v1/vehicles', '/api/v1/drivers', '/api/v1/fuel', '/api/v1/compliance'];

    for (const route of routes) {
      const res = await request(app).get(route).set('X-Organization-Id', TENANT_B);
      expect(res.status).toBe(200);
      for (const row of res.body.data) {
        expect(row.organizationId).toBe(TENANT_B);
      }
    }
  });
});

describe('Isolation sur accès par identifiant', () => {
  it('sert le score du chauffeur à son organisation', async () => {
    const res = await request(app)
      .get(`/api/v1/scoring/drivers/${DRIVER_A}`)
      .set('X-Organization-Id', TENANT_A);

    expect(res.status).toBe(200);
    expect(res.body.data.driver.organizationId).toBe(TENANT_A);
    expect(res.body.data.scoreResult.score).toBeGreaterThanOrEqual(0);
  });

  it("refuse le score d'un chauffeur appartenant à une autre organisation", async () => {
    // Régression majeure : la version initiale cherchait le chauffeur dans
    // l'ensemble des tenants, sans filtre. Un identifiant deviné suffisait à
    // lire le dossier d'un chauffeur concurrent.
    const res = await request(app)
      .get(`/api/v1/scoring/drivers/${DRIVER_A}`)
      .set('X-Organization-Id', TENANT_B);

    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('data');
  });
});

describe('Ingestion télémétrique', () => {
  const point = {
    latitude: 6.37,
    longitude: 2.42,
    speedKmH: 62,
    headingDegree: 180,
    timestamp: '2026-08-05T09:00:00.000Z',
    accuracyMeters: 8,
    ignitionOn: true,
    batteryLevelPct: 88,
    networkType: '3G' as const,
  };

  const batch = (batchId: string) => ({
    batchId,
    vehicleId: VEHICLE_A,
    driverId: DRIVER_A,
    points: [point],
  });

  it('accepte un lot valide', async () => {
    const res = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set('X-Organization-Id', TENANT_A)
      .send(batch('batch-unique-001'));

    expect(res.status).toBe(202);
    expect(res.body.data.idempotentDuplicate).toBe(false);
  });

  it('est idempotente : un rejeu ne recompte pas les points', async () => {
    // Cas réel : un boîtier sort d'une zone blanche et renvoie le même lot.
    // Sans idempotence, les infractions sont comptées deux fois — donc le
    // score du chauffeur et sa prime sont faussés.
    const payload = batch('batch-rejoue-002');

    const first = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set('X-Organization-Id', TENANT_A)
      .send(payload);
    const replay = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set('X-Organization-Id', TENANT_A)
      .send(payload);

    expect(first.body.data.idempotentDuplicate).toBe(false);
    expect(replay.body.data.idempotentDuplicate).toBe(true);
    expect(replay.body.data.processedPoints).toBe(first.body.data.processedPoints);
  });

  it('rejette des coordonnées et vitesses impossibles', async () => {
    const res = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set('X-Organization-Id', TENANT_A)
      .send({
        ...batch('batch-aberrant-003'),
        points: [{ ...point, latitude: 999, speedKmH: 900 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details.map((d: { path: string }) => d.path)).toContain('points.0.latitude');
  });

  it("refuse d'ingérer pour un véhicule d'une autre organisation", async () => {
    const res = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set('X-Organization-Id', TENANT_B)
      .send(batch('batch-vol-004'));

    expect(res.status).toBe(403);
  });

  it('borne la taille des lots', async () => {
    const res = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set('X-Organization-Id', TENANT_A)
      .send({ ...batch('batch-enorme-005'), points: Array(501).fill(point) });

    expect(res.status).toBe(400);
  });
});

describe('Synchronisation hors-ligne', () => {
  it('écarte les éléments rattachés à une autre organisation', async () => {
    const res = await request(app)
      .post('/api/v1/sync/offline-batch')
      .set('X-Organization-Id', TENANT_A)
      .send({
        items: [
          {
            id: 'q1',
            type: 'FUEL_LOG',
            payload: { liters: 120 },
            timestamp: '2026-08-05T09:00:00.000Z',
            status: 'PENDING',
            tenantOrgId: TENANT_A,
            retryCount: 0,
          },
          {
            id: 'q2',
            type: 'FUEL_LOG',
            payload: { liters: 300 },
            timestamp: '2026-08-05T09:00:00.000Z',
            status: 'PENDING',
            tenantOrgId: TENANT_B,
            retryCount: 0,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.syncedItemIds).toEqual(['q1']);
    expect(res.body.data.rejectedItemIds).toEqual(['q2']);
  });

  it("annonce honnêtement que rien n'est encore persisté", async () => {
    // Un acquittement mensonger ferait vider la file locale du terrain et
    // perdrait définitivement les saisies du chauffeur.
    const res = await request(app)
      .post('/api/v1/sync/offline-batch')
      .set('X-Organization-Id', TENANT_A)
      .send({
        items: [
          {
            id: 'q3',
            type: 'ODOMETER_UPDATE',
            payload: { km: 150000 },
            timestamp: '2026-08-05T09:00:00.000Z',
            status: 'PENDING',
            tenantOrgId: TENANT_A,
            retryCount: 0,
          },
        ],
      });

    expect(res.body.data.persisted).toBe(false);
  });
});

describe("Garde-fous de l'IA", () => {
  it("échoue explicitement plutôt que d'inventer une analyse", async () => {
    // Sans clé API et hors mode démonstration, la route doit renvoyer une
    // erreur. La version initiale renvoyait un diagnostic fabriqué en 200,
    // indiscernable d'une analyse réelle.
    const res = await request(app)
      .post('/api/v1/intelligence/analyze')
      .set('X-Organization-Id', TENANT_A)
      .send({ prompt: 'Analyse ma flotte' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_NOT_CONFIGURED');
    expect(res.body).not.toHaveProperty('data');
  });

  it('borne la taille des invites pour maîtriser le coût en tokens', async () => {
    const res = await request(app)
      .post('/api/v1/intelligence/analyze')
      .set('X-Organization-Id', TENANT_A)
      .send({ prompt: 'a'.repeat(5_000) });

    expect(res.status).toBe(400);
  });
});

describe('Surface HTTP', () => {
  it('répond à la sonde de vivacité sans authentification', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('renvoie une 404 JSON sur une route d’API inconnue', async () => {
    const res = await request(app).get('/api/v1/route-qui-nexiste-pas');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it("n'expose pas l'en-tête X-Powered-By", async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('applique les en-têtes de sécurité Helmet', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
