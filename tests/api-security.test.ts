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

/**
 * Ces contrôles portent sur la surface HTTP — validation, idempotence,
 * garde-fous — indépendamment du mode d'identification. Ils doivent donc
 * fonctionner dans les deux configurations :
 *   - sans base : l'en-tête d'organisation suffit (mode démonstration) ;
 *   - avec base : un jeton réel est nécessaire.
 *
 * Les cantonner à un seul mode ferait perdre cette couverture précisément
 * dans la configuration qui compte le plus.
 */
const DATABASE_CONFIGURED = Boolean(process.env.DATABASE_APP_URL && process.env.JWT_SECRET);
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FleetGuard2026!Demo';

const TENANT_ACCOUNTS: Record<string, string> = {
  [TENANT_A]: 'manager@transafrik.bj',
  [TENANT_B]: 'manager@sahelexpress.sn',
};

/**
 * L'ingestion télémétrique appartient au terrain, pas aux rôles de bureau :
 * un gestionnaire de flotte ne dispose pas de `tracking:ingest`. Ces contrôles
 * portent sur le format et l'idempotence des lots, pas sur les permissions —
 * ils utilisent donc un compte habilité.
 */
const INGEST_ACCOUNT = 'admin@transafrik.bj';

let app: Express;
const tokens = new Map<string, string>();

/** En-têtes désignant l'organisation, selon le mode actif. */
async function as(tenant: string, account?: string): Promise<Record<string, string>> {
  if (!DATABASE_CONFIGURED) return { 'X-Organization-Id': tenant };

  const email = account ?? TENANT_ACCOUNTS[tenant]!;
  if (!tokens.has(email)) {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: SEED_PASSWORD });
    expect(res.status, `connexion ${email} : ${JSON.stringify(res.body)}`).toBe(200);
    tokens.set(email, res.body.data.accessToken);
  }
  return { Authorization: `Bearer ${tokens.get(email)}` };
}

/**
 * Identifiants du jeu de démonstration contre identifiants réels : avec une
 * base, les entités portent des UUID. On résout donc l'identifiant à partir
 * des données servies.
 */
/**
 * Entités du peuplement, jamais celles d'une autre suite.
 *
 * Ces fonctions prenaient `data[0]`. Les suites s'exécutant en parallèle, ce
 * premier élément pouvait être le véhicule dédié d'un autre fichier — archivé
 * en cours de route par son propre nettoyage. L'ingestion répondait alors 403
 * « ce véhicule n'appartient pas à votre organisation », sans que le code
 * vérifié soit en cause.
 *
 * Les entités créées par les tests portent un préfixe reconnaissable ; on les
 * écarte pour ne retenir que celles du jeu de démonstration, qui sont stables.
 */
const TEST_ARTIFACT = /^(TS|MS|MT)-/;

async function firstDriverId(tenant: string): Promise<string> {
  if (!DATABASE_CONFIGURED) return DRIVER_A;
  const res = await request(app)
    .get('/api/v1/drivers')
    .set(await as(tenant));
  const seeded = res.body.data.filter(
    (driver: { licenseNumber?: string }) => !TEST_ARTIFACT.test(driver.licenseNumber ?? ''),
  );
  expect(seeded.length, 'aucun chauffeur du peuplement').toBeGreaterThan(0);
  return seeded[0].id;
}

async function firstVehicleId(tenant: string): Promise<string> {
  if (!DATABASE_CONFIGURED) return VEHICLE_A;
  const res = await request(app)
    .get('/api/v1/vehicles')
    .set(await as(tenant));
  const seeded = res.body.data.filter(
    (vehicle: { immatriculation: string }) => !TEST_ARTIFACT.test(vehicle.immatriculation),
  );
  expect(seeded.length, 'aucun véhicule du peuplement').toBeGreaterThan(0);
  return seeded[0].id;
}

const orgIds = new Map<string, string>();

/**
 * Identifiant réel de l'organisation : jeu de démonstration ou UUID en base.
 * Mis en cache : ces suites enchaînent de nombreuses requêtes, et le limiteur
 * de débit finirait par les refuser.
 */
async function orgIdOf(tenant: string): Promise<string> {
  if (!DATABASE_CONFIGURED) return tenant;
  if (!orgIds.has(tenant)) {
    const res = await request(app)
      .get('/api/v1/organizations/me')
      .set(await as(tenant));
    expect(res.status, `organisation ${tenant} : ${JSON.stringify(res.body)}`).toBe(200);
    orgIds.set(tenant, res.body.data.id);
  }
  return orgIds.get(tenant)!;
}

beforeAll(async () => {
  app = await createApp();
});

beforeEach(() => {
  resetIdempotencyStore();
});

describe('Résolution du tenant', () => {
  it('refuse une requête sans organisation ni session', async () => {
    const res = await request(app).get('/api/v1/vehicles');

    // 400 en démonstration (organisation non précisée), 401 avec base
    // (authentification requise) : dans les deux cas, rien n'est servi.
    expect([400, 401]).toContain(res.status);
    expect(res.body).not.toHaveProperty('data');
  });

  it('refuse une organisation inconnue', async () => {
    const res = await request(app).get('/api/v1/vehicles').set('X-Organization-Id', 'org_inexistant');

    // Sans session valide, l'en-tête seul ne donne accès à rien.
    expect([401, 403]).toContain(res.status);
  });

  it('sert les véhicules du tenant demandé', async () => {
    const res = await request(app)
      .get('/api/v1/vehicles')
      .set(await as(TENANT_A));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);

    const expectedOrgId = await orgIdOf(TENANT_A);
    for (const vehicle of res.body.data) {
      expect(vehicle.organizationId).toBe(expectedOrgId);
    }
  });

  it("ne laisse fuir aucune donnée d'un autre tenant sur les listes", async () => {
    const routes = ['/api/v1/vehicles', '/api/v1/drivers', '/api/v1/fuel', '/api/v1/compliance'];

    const expectedOrgId = await orgIdOf(TENANT_B);
    for (const route of routes) {
      const res = await request(app)
        .get(route)
        .set(await as(TENANT_B));
      expect(res.status).toBe(200);
      for (const row of res.body.data) {
        expect(row.organizationId, route).toBe(expectedOrgId);
      }
    }
  });
});

describe('Isolation sur accès par identifiant', () => {
  it('sert le score du chauffeur à son organisation', async () => {
    const res = await request(app)
      .get(`/api/v1/scoring/drivers/${await firstDriverId(TENANT_A)}`)
      .set(await as(TENANT_A));

    expect(res.status).toBe(200);
    expect(res.body.data.driver.organizationId).toBe(await orgIdOf(TENANT_A));
    expect(res.body.data.scoreResult.score).toBeGreaterThanOrEqual(0);
  });

  it("refuse le score d'un chauffeur appartenant à une autre organisation", async () => {
    // Régression majeure : la version initiale cherchait le chauffeur dans
    // l'ensemble des tenants, sans filtre. Un identifiant deviné suffisait à
    // lire le dossier d'un chauffeur concurrent.
    const res = await request(app)
      .get(`/api/v1/scoring/drivers/${await firstDriverId(TENANT_A)}`)
      .set(await as(TENANT_B));

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

  // Le véhicule et le chauffeur sont résolus une fois : avec une base, ce sont
  // des UUID ; sans base, les identifiants du jeu de démonstration.
  let vehicleId: string;
  let driverId: string;

  beforeAll(async () => {
    vehicleId = await firstVehicleId(TENANT_A);
    driverId = await firstDriverId(TENANT_A);
  });

  // L'identifiant est unique à chaque exécution : avec une vraie base,
  // l'idempotence est garantie par une contrainte d'unicité qui survit au
  // processus. Un identifiant figé ferait échouer la deuxième exécution de la
  // suite en présentant un lot déjà connu comme un rejeu.
  const run = Date.now();
  const batch = (batchId: string) => ({
    batchId: `${batchId}-${run}`,
    vehicleId,
    driverId,
    points: [point],
  });

  it('accepte un lot valide', async () => {
    const res = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set(await as(TENANT_A, INGEST_ACCOUNT))
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
      .set(await as(TENANT_A, INGEST_ACCOUNT))
      .send(payload);
    const replay = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set(await as(TENANT_A, INGEST_ACCOUNT))
      .send(payload);

    expect(first.body.data.idempotentDuplicate).toBe(false);
    expect(replay.body.data.idempotentDuplicate).toBe(true);
    expect(replay.body.data.processedPoints).toBe(first.body.data.processedPoints);
  });

  it('rejette des coordonnées et vitesses impossibles', async () => {
    const res = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set(await as(TENANT_A, INGEST_ACCOUNT))
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
      .set(await as(TENANT_B))
      .send(batch('batch-vol-004'));

    expect(res.status).toBe(403);
  });

  it('borne la taille des lots', async () => {
    const res = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set(await as(TENANT_A, INGEST_ACCOUNT))
      .send({ ...batch('batch-enorme-005'), points: Array(501).fill(point) });

    expect(res.status).toBe(400);
  });
});

describe('Synchronisation hors-ligne', () => {
  it('écarte les éléments rattachés à une autre organisation', async () => {
    const res = await request(app)
      .post('/api/v1/sync/offline-batch')
      .set(await as(TENANT_A))
      .send({
        items: [
          {
            id: 'q1',
            type: 'FUEL_LOG',
            payload: { liters: 120 },
            timestamp: '2026-08-05T09:00:00.000Z',
            status: 'PENDING',
            tenantOrgId: await orgIdOf(TENANT_A),
            retryCount: 0,
          },
          {
            id: 'q2',
            type: 'FUEL_LOG',
            payload: { liters: 300 },
            timestamp: '2026-08-05T09:00:00.000Z',
            status: 'PENDING',
            tenantOrgId: await orgIdOf(TENANT_B),
            retryCount: 0,
          },
        ],
      });

    expect(res.status).toBe(200);
    // L'élément d'un autre tenant est écarté quoi qu'il arrive. Celui du bon
    // tenant est incomplet (aucune plaque) : il est refusé lui aussi, mais
    // pour un motif différent, et reste dans la file du terrain.
    expect(res.body.data.rejectedItemIds).toContain('q2');
    expect(res.body.data.syncedItemIds).not.toContain('q2');
  });

  it("n'acquitte jamais une saisie qu'il n'a pas écrite", async () => {
    // Un acquittement mensonger ferait vider la file locale du terrain et
    // perdrait définitivement les saisies du chauffeur.
    const res = await request(app)
      .post('/api/v1/sync/offline-batch')
      .set(await as(TENANT_A))
      .send({
        items: [
          {
            id: 'q3',
            type: 'ODOMETER_UPDATE',
            // Aucune plaque : le serveur ne peut rattacher ce relevé à rien.
            payload: { km: 150000 },
            timestamp: '2026-08-05T09:00:00.000Z',
            status: 'PENDING',
            tenantOrgId: await orgIdOf(TENANT_A),
            retryCount: 0,
          },
        ],
      });

    expect(res.body.data.syncedItemIds).not.toContain('q3');
    expect(res.body.data.rejectedItemIds).toContain('q3');
  });
});

describe("Garde-fous de l'IA", () => {
  it("échoue explicitement plutôt que d'inventer une analyse", async () => {
    // Sans clé API et hors mode démonstration, la route doit renvoyer une
    // erreur. La version initiale renvoyait un diagnostic fabriqué en 200,
    // indiscernable d'une analyse réelle.
    const res = await request(app)
      .post('/api/v1/intelligence/analyze')
      .set(await as(TENANT_A))
      .send({ prompt: 'Analyse ma flotte' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_NOT_CONFIGURED');
    expect(res.body).not.toHaveProperty('data');
  });

  it('borne la taille des invites pour maîtriser le coût en tokens', async () => {
    const res = await request(app)
      .post('/api/v1/intelligence/analyze')
      .set(await as(TENANT_A))
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
