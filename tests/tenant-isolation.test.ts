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

describe.skipIf(!DATABASE_CONFIGURED)('Écriture de la flotte', () => {
  let tokenA: string;
  let tokenB: string;
  let createdVehicleId: string;

  beforeAll(async () => {
    app = await createApp();
    tokenA = await tokenFor(TENANT_A_USER);
    tokenB = await tokenFor(TENANT_B_USER);
  });

  const vehiclePayload = (plate: string) => ({
    immatriculation: plate,
    vin: `VINTEST${plate.replace(/-/g, '')}`,
    make: 'Test',
    model: 'Modèle de test',
    year: 2024,
    type: 'HEAVY_TRUCK',
    fuelType: 'DIESEL',
    tankCapacityLiters: 400,
    expectedConsumptionL100km: 35,
  });

  it('crée un véhicule dans l’organisation du jeton', async () => {
    const plate = `TS-${Math.floor(1000 + Math.random() * 8999)}-Z`;
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(vehiclePayload(plate));

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.immatriculation).toBe(plate);
    createdVehicleId = res.body.data.id;
  });

  it('rend le véhicule créé visible à son organisation seulement', async () => {
    const [a, b] = await Promise.all([
      request(app).get('/api/v1/vehicles').set('Authorization', `Bearer ${tokenA}`),
      request(app).get('/api/v1/vehicles').set('Authorization', `Bearer ${tokenB}`),
    ]);

    const idsA = a.body.data.map((v: { id: string }) => v.id);
    const idsB = b.body.data.map((v: { id: string }) => v.id);

    expect(idsA).toContain(createdVehicleId);
    expect(idsB).not.toContain(createdVehicleId);
  });

  it('refuse à une autre organisation de modifier ce véhicule', async () => {
    // Le tenant B connaît l'identifiant exact et tente malgré tout la mise à jour.
    const res = await request(app)
      .patch(`/api/v1/vehicles/${createdVehicleId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ status: 'OUT_OF_SERVICE' });

    expect(res.status).toBe(404);
  });

  it('valide les données entrantes', async () => {
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ...vehiclePayload('TS-0001-Z'), year: 1900, expectedConsumptionL100km: -5 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('archive sans détruire, puis le véhicule disparaît des listes', async () => {
    await request(app)
      .delete(`/api/v1/vehicles/${createdVehicleId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);

    const after = await request(app).get('/api/v1/vehicles').set('Authorization', `Bearer ${tokenA}`);
    const ids = after.body.data.map((v: { id: string }) => v.id);
    expect(ids).not.toContain(createdVehicleId);
  });

  it('refuse la création à un rôle sans permission', async () => {
    const technicianToken = await tokenFor(TECHNICIAN);
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send(vehiclePayload('TS-9999-Z'));

    expect(res.status).toBe(403);
  });
});

describe.skipIf(!DATABASE_CONFIGURED)('Persistance de la télémétrie', () => {
  let adminToken: string;
  let vehicleId: string;
  let driverId: string;

  beforeAll(async () => {
    app = await createApp();
    // L'ingestion appartient au terrain : un rôle de bureau ne la porte pas.
    adminToken = await tokenFor('admin@transafrik.bj');

    const vehicles = await request(app).get('/api/v1/vehicles').set('Authorization', `Bearer ${adminToken}`);
    vehicleId = vehicles.body.data[0].id;

    const drivers = await request(app).get('/api/v1/drivers').set('Authorization', `Bearer ${adminToken}`);
    driverId = drivers.body.data[0].id;
  });

  /** Trajet comportant un excès de vitesse prolongé et un freinage brusque. */
  const trip = (batchId: string) => {
    const base = Date.parse('2026-08-06T14:00:00.000Z');
    const speeds = [60, 70, 96, 98, 97, 62];
    return {
      batchId,
      vehicleId,
      driverId,
      points: speeds.map((speedKmH, index) => ({
        latitude: 7.9124 + index * 0.02,
        longitude: 2.1092 + index * 0.01,
        speedKmH,
        headingDegree: 45,
        timestamp: new Date(base + index * 60_000).toISOString(),
        accuracyMeters: 6,
        ignitionOn: true,
        batteryLevelPct: 90,
        networkType: '3G' as const,
        ...(index === 5 ? { eventFlags: ['HARSH_BRAKE' as const] } : {}),
      })),
    };
  };

  it('enregistre les points et déclare la persistance', async () => {
    const res = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(trip(`persist-${Date.now()}`));

    expect(res.status).toBe(202);
    expect(res.body.data.persisted).toBe(true);
    expect(res.body.data.distanceKm).toBeGreaterThan(0);
    expect(res.body.data.detectedEvents).toBeGreaterThan(0);
  });

  it('restitue la trace du véhicule', async () => {
    const res = await request(app)
      .get(`/api/v1/tracking/vehicles/${vehicleId}/points?limit=50`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);

    // Les points sont rendus du plus ancien au plus récent : c'est l'ordre
    // dans lequel une trace se lit et se rejoue sur une carte.
    const timestamps = res.body.data.map((p: { timestamp: string }) => Date.parse(p.timestamp));
    const sorted = [...timestamps].sort((a, b) => a - b);
    expect(timestamps).toEqual(sorted);
  });

  it('détecte les infractions côté serveur, sans les compter deux fois', async () => {
    const batchId = `idem-${Date.now()}`;

    // La liste est plafonnée côté serveur : comparer sa longueur ne dit plus
    // rien dès que le plafond est atteint. On compte les événements portant
    // l'horodatage du lot, ce qui reste vrai quel que soit l'historique.
    const countBatchEvents = async () => {
      const res = await request(app)
        .get('/api/v1/tracking/events?limit=500')
        .set('Authorization', `Bearer ${adminToken}`);
      return res.body.data.filter((event: { recordedAt: string }) =>
        event.recordedAt.startsWith('2026-08-06T14:0'),
      ).length;
    };

    const before = await countBatchEvents();

    const first = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(trip(batchId));

    const replay = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(trip(batchId));

    expect(first.body.data.idempotentDuplicate).toBe(false);
    expect(replay.body.data.idempotentDuplicate).toBe(true);

    // Le rejeu n'ajoute aucun événement : sans cette garantie, le score du
    // chauffeur — donc sa prime — dépendrait de la qualité du réseau.
    const added = (await countBatchEvents()) - before;
    expect(added).toBe(first.body.data.detectedEvents);
  });

  it('calcule le score sur la distance réellement parcourue', async () => {
    const res = await request(app)
      .get(`/api/v1/scoring/drivers/${driverId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.basedOnRealTelemetry).toBe(true);
    expect(res.body.data.scoreResult.distanceDrivenKm).toBeGreaterThan(0);
    // La version de configuration accompagne le score : sans elle, il ne peut
    // pas être défendu ni recalculé à l'identique.
    expect(res.body.data.configVersion).toBeGreaterThan(0);
  });

  it('ne retient pas un score calculé sur une distance non représentative', async () => {
    const res = await request(app)
      .get(`/api/v1/scoring/drivers/${driverId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Les lots de test totalisent quelques kilomètres : très en deçà du seuil.
    expect(res.body.data.isSignificant).toBe(false);
    expect(res.body.data.minimumDistanceKm).toBeGreaterThan(0);
    expect(res.body.data.scoreResult.distanceDrivenKm).toBeLessThan(res.body.data.minimumDistanceKm);

    // Un score non représentatif ne devient pas la note officielle du
    // chauffeur : sur 12 km, une seule infraction équivaut à cinq incidents
    // aux 100 km et ferait chuter la note à 40/100. Un gestionnaire
    // convoquerait le chauffeur sur un artefact de calcul.
    expect(res.body.data.driver.currentSafetyScore).toBeGreaterThan(res.body.data.scoreResult.score);
  });

  it("n'historise pas un score non représentatif", async () => {
    const res = await request(app)
      .get(`/api/v1/scoring/drivers/${driverId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // L'historique alimente la courbe de tendance et, à terme, la prime : y
    // inscrire un score calculé sur quelques kilomètres la fausserait.
    const today = new Date().toISOString().slice(0, 10);
    expect(res.body.data.history.some((h: { date: string }) => h.date === today)).toBe(false);
  });

  it("refuse d'ingérer pour un véhicule d'une autre organisation", async () => {
    const otherToken = await tokenFor(TENANT_B_USER);
    const res = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set('Authorization', `Bearer ${otherToken}`)
      .send(trip(`vol-${Date.now()}`));

    // Le tenant B ne possède ni ce véhicule ni ce chauffeur.
    expect([403, 404]).toContain(res.status);
  });

  it('reconstruit le trajet à partir de la trace ingérée', async () => {
    await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(trip(`trajet-${Date.now()}`));

    const res = await request(app)
      .get(`/api/v1/tracking/trips?vehicleId=${vehicleId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);

    const built = res.body.data[0];
    expect(built.distanceKm).toBeGreaterThan(0);
    expect(built.durationSeconds).toBeGreaterThan(0);
    expect(built.pointCount).toBeGreaterThanOrEqual(2);
    expect(built.maxSpeedKmH).toBeGreaterThan(0);
  });

  it('ne duplique pas un trajet quand la trace est réanalysée', async () => {
    // Un boîtier qui rejoue son lot, ou un lot qui prolonge un trajet déjà
    // reconstruit, ne doit pas faire apparaître deux fois la même mission dans
    // le rapport d'activité.
    const before = await request(app)
      .get(`/api/v1/tracking/trips?vehicleId=${vehicleId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(trip(`rejeu-${Date.now()}`));

    const after = await request(app)
      .get(`/api/v1/tracking/trips?vehicleId=${vehicleId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(after.body.data.length).toBe(before.body.data.length);
  });

  it("ne montre pas les trajets d'une organisation à une autre", async () => {
    const otherToken = await tokenFor(TENANT_B_USER);

    // Filtrer sur un véhicule qu'on ne possède pas doit être refusé, et non
    // répondu par une liste vide qui laisserait croire à un parc inactif.
    const filtered = await request(app)
      .get(`/api/v1/tracking/trips?vehicleId=${vehicleId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(filtered.status).toBe(404);

    // Et la liste non filtrée ne contient aucun trajet du tenant A.
    const all = await request(app).get('/api/v1/tracking/trips').set('Authorization', `Bearer ${otherToken}`);
    expect(all.status).toBe(200);
    expect(all.body.data.some((t: { vehicleId: string }) => t.vehicleId === vehicleId)).toBe(false);
  });
});

describe.skipIf(!DATABASE_CONFIGURED)('Centre d’alertes', () => {
  let adminToken: string;

  beforeAll(async () => {
    app = await createApp();
    adminToken = await tokenFor('admin@transafrik.bj');
  });

  const list = (token: string) => request(app).get('/api/v1/alerts').set('Authorization', `Bearer ${token}`);

  it('dérive les alertes des faits enregistrés, avec leur source', async () => {
    const res = await list(adminToken);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);

    // Une alerte sans source traçable ne peut fonder aucune décision.
    for (const alert of res.body.data) {
      expect(alert.sourceType).toBeTruthy();
      expect(alert.sourceId).toBeTruthy();
    }
  });

  it('conserve l’acquittement au rechargement', async () => {
    const before = await list(adminToken);
    const target =
      before.body.data.find((a: { status: string }) => a.status === 'UNHANDLED') ?? before.body.data[0];

    const patched = await request(app)
      .patch(`/api/v1/alerts/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'IN_REVIEW' });

    expect(patched.status).toBe(200);
    expect(patched.body.data.acknowledgedAt).toBeTruthy();

    // Le rechargement relance la dérivation : elle ne doit pas rouvrir une
    // alerte déjà prise en charge.
    const after = await list(adminToken);
    const reloaded = after.body.data.find((a: { id: string }) => a.id === target.id);

    expect(reloaded.status).toBe('IN_REVIEW');
    expect(reloaded.acknowledgedAt).toBeTruthy();
  });

  it('conserve la note de résolution', async () => {
    const before = await list(adminToken);
    const target = before.body.data[0];

    await request(app)
      .patch(`/api/v1/alerts/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'RESOLVED', resolutionNote: 'Chauffeur reçu, rappel des consignes.' });

    const after = await list(adminToken);
    const reloaded = after.body.data.find((a: { id: string }) => a.id === target.id);

    expect(reloaded.status).toBe('RESOLVED');
    expect(reloaded.resolutionNote).toBe('Chauffeur reçu, rappel des consignes.');
    expect(reloaded.resolvedAt).toBeTruthy();
  });

  it('ne montre pas les alertes d’une organisation à une autre', async () => {
    const otherToken = await tokenFor(TENANT_B_USER);

    const mine = await list(adminToken);
    const theirs = await list(otherToken);

    const myIds = new Set(mine.body.data.map((a: { id: string }) => a.id));
    expect(theirs.body.data.some((a: { id: string }) => myIds.has(a.id))).toBe(false);
  });

  it('refuse de traiter une alerte d’une autre organisation', async () => {
    const otherToken = await tokenFor(TENANT_B_USER);
    const mine = await list(adminToken);

    const res = await request(app)
      .patch(`/api/v1/alerts/${mine.body.data[0].id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ status: 'DISMISSED' });

    expect(res.status).toBe(404);
  });

  it('refuse le traitement à un rôle sans permission', async () => {
    const techToken = await tokenFor('atelier@transafrik.bj');
    const mine = await list(adminToken);

    const res = await request(app)
      .patch(`/api/v1/alerts/${mine.body.data[0].id}`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ status: 'RESOLVED' });

    expect(res.status).toBe(403);
  });
});

describe.skipIf(!DATABASE_CONFIGURED)('Saisies hors ligne', () => {
  let adminToken: string;
  let plate: string;
  let odometerKm: number;
  let organizationId: string;

  beforeAll(async () => {
    app = await createApp();
    adminToken = await tokenFor('admin@transafrik.bj');

    const org = await request(app)
      .get('/api/v1/organizations/me')
      .set('Authorization', `Bearer ${adminToken}`);
    organizationId = org.body.data.id;

    const vehicles = await request(app).get('/api/v1/vehicles').set('Authorization', `Bearer ${adminToken}`);
    plate = vehicles.body.data[0].immatriculation;
    odometerKm = vehicles.body.data[0].currentOdometerKm;
  });

  const send = (token: string, items: unknown[]) =>
    request(app).post('/api/v1/sync/offline-batch').set('Authorization', `Bearer ${token}`).send({ items });

  const item = (id: string, type: string, payload: Record<string, unknown>) => ({
    id,
    type,
    payload,
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    tenantOrgId: organizationId,
    retryCount: 0,
  });

  it('écrit réellement un plein saisi hors ligne', async () => {
    const id = `off-plein-${Date.now()}`;
    const res = await send(adminToken, [
      item(id, 'FUEL_LOG', {
        vehicleRegistration: plate,
        // Volume compatible avec le réservoir : un plein impossible est
        // désormais refusé, et c'est le sujet d'un autre test.
        litersAdded: 60,
        pricePerLiter: 650,
        stationName: 'Station Total Malanville',
        loggedAt: new Date().toISOString(),
      }),
    ]);

    expect(res.status).toBe(200);
    expect(res.body.data.persisted).toBe(true);
    expect(res.body.data.syncedItemIds).toContain(id);

    // La saisie doit se retrouver au bureau, pas seulement être acquittée.
    const fuel = await request(app).get('/api/v1/fuel').set('Authorization', `Bearer ${adminToken}`);
    expect(
      fuel.body.data.some((log: { stationName: string }) => log.stationName.includes('Malanville')),
    ).toBe(true);
  });

  it('ne duplique pas un lot rejoué après une coupure', async () => {
    // Le nom de station est unique à chaque exécution : avec une vraie base,
    // les pleins écrits par les exécutions précédentes survivent.
    const station = `Station rejeu ${Date.now()}`;
    const payload = item(`off-rejeu-${Date.now()}`, 'FUEL_LOG', {
      vehicleRegistration: plate,
      litersAdded: 55,
      pricePerLiter: 650,
      stationName: station,
      loggedAt: new Date().toISOString(),
    });

    await send(adminToken, [payload]);
    await send(adminToken, [payload]);

    const fuel = await request(app).get('/api/v1/fuel').set('Authorization', `Bearer ${adminToken}`);
    const matches = fuel.body.data.filter((log: { stationName: string }) => log.stationName === station);
    expect(matches).toHaveLength(1);
  });

  it('applique un relevé de compteur', async () => {
    const target = odometerKm + 500;
    const res = await send(adminToken, [
      item(`off-compteur-${Date.now()}`, 'ODOMETER_UPDATE', {
        vehicleRegistration: plate,
        newOdometerKm: target,
      }),
    ]);

    expect(res.body.data.totalProcessed).toBe(1);

    const vehicles = await request(app).get('/api/v1/vehicles').set('Authorization', `Bearer ${adminToken}`);
    const vehicle = vehicles.body.data.find((v: { immatriculation: string }) => v.immatriculation === plate);
    expect(vehicle.currentOdometerKm).toBeGreaterThanOrEqual(target);
  });

  it('refuse un volume supérieur à la contenance du réservoir', async () => {
    // La faute de frappe la plus courante du terrain : 180 au lieu de 18,0.
    // L'accepter fausserait la consommation calculée, donc la détection de
    // siphonnage et la prime du chauffeur.
    const id = `off-cuve-${Date.now()}`;
    const res = await send(adminToken, [
      item(id, 'FUEL_LOG', {
        vehicleRegistration: plate,
        litersAdded: 9000,
        pricePerLiter: 650,
        stationName: 'Station volume aberrant',
      }),
    ]);

    expect(res.body.data.syncedItemIds).not.toContain(id);
    const result = res.body.data.results.find((r: { id: string }) => r.id === id);
    expect(result.serverMessage).toContain('réservoir');
  });

  it('refuse un compteur qui recule, sans acquitter', async () => {
    const id = `off-recul-${Date.now()}`;
    const res = await send(adminToken, [
      item(id, 'ODOMETER_UPDATE', { vehicleRegistration: plate, newOdometerKm: 1 }),
    ]);

    // Un odomètre ne recule pas : l'appliquer fausserait les échéances
    // d'entretien. L'élément reste dans la file du terrain.
    expect(res.body.data.syncedItemIds).not.toContain(id);
    expect(res.body.data.rejectedItemIds).toContain(id);
  });

  it('n’acquitte pas une saisie visant un véhicule inconnu', async () => {
    const id = `off-inconnu-${Date.now()}`;
    const res = await send(adminToken, [
      item(id, 'FUEL_LOG', {
        vehicleRegistration: 'ZZ-0000-Z',
        litersAdded: 100,
        pricePerLiter: 650,
      }),
    ]);

    expect(res.body.data.syncedItemIds).not.toContain(id);
    const result = res.body.data.results.find((r: { id: string }) => r.id === id);
    // Le motif doit être exploitable par celui qui devra corriger la saisie.
    expect(result.serverMessage).toContain('ZZ-0000-Z');
  });

  it('rejette une saisie rattachée à une autre organisation', async () => {
    const id = `off-etranger-${Date.now()}`;
    const res = await send(adminToken, [
      {
        ...item(id, 'FUEL_LOG', { vehicleRegistration: plate, litersAdded: 50 }),
        tenantOrgId: 'org-autre',
      },
    ]);

    expect(res.body.data.rejectedItemIds).toContain(id);
    expect(res.body.data.syncedItemIds).not.toContain(id);
  });
});

describe.skipIf(!DATABASE_CONFIGURED)('Primes de conduite économe', () => {
  let adminToken: string;

  beforeAll(async () => {
    app = await createApp();
    adminToken = await tokenFor('admin@transafrik.bj');
  });

  const profiles = (token: string) =>
    request(app).get('/api/v1/rewards/profiles').set('Authorization', `Bearer ${token}`);

  it('calcule les primes sur les données réelles de la flotte', async () => {
    const res = await profiles(adminToken);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);

    for (const profile of res.body.data) {
      // Une prime nulle doit toujours s'expliquer au chauffeur qui l'attendait.
      if (profile.bonusEarned === 0) {
        expect(profile.ineligibilityReason).toBeTruthy();
      } else {
        expect(profile.estimatedFuelSavedLiters).toBeGreaterThan(0);
      }
    }
  });

  it('classe les chauffeurs sans trou dans les rangs', async () => {
    const res = await profiles(adminToken);
    const ranks = res.body.data.map((p: { rankInCompany: number }) => p.rankInCompany);
    expect(ranks).toEqual(ranks.map((_: number, index: number) => index + 1));
  });

  it('conserve la décision de versement au rechargement', async () => {
    const before = await profiles(adminToken);
    const target = before.body.data[0];

    const patched = await request(app)
      .patch(`/api/v1/rewards/profiles/${target.driverId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ payoutStatus: 'APPROVED' });
    expect(patched.status).toBe(200);

    // Le recalcul du montant ne doit pas effacer la décision d'engagement.
    const after = await profiles(adminToken);
    const reloaded = after.body.data.find((p: { driverId: string }) => p.driverId === target.driverId);
    expect(reloaded.payoutStatus).toBe('APPROVED');
  });

  it('horodate le versement côté serveur', async () => {
    const list = await profiles(adminToken);
    const target = list.body.data[0];

    await request(app)
      .patch(`/api/v1/rewards/profiles/${target.driverId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ payoutStatus: 'PAID', payoutMethod: 'FUEL_VOUCHER' });

    const after = await profiles(adminToken);
    const reloaded = after.body.data.find((p: { driverId: string }) => p.driverId === target.driverId);
    expect(reloaded.lastPayoutAt).toBeTruthy();
  });

  it('enregistre une distinction décernée', async () => {
    const list = await profiles(adminToken);
    const target = list.body.data[0];

    const badges = await request(app)
      .get('/api/v1/rewards/badges')
      .set('Authorization', `Bearer ${adminToken}`);
    const code = badges.body.data[0].code;

    const granted = await request(app)
      .post(`/api/v1/rewards/profiles/${target.driverId}/badges`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ badgeCode: code });
    expect(granted.status).toBe(201);

    const after = await profiles(adminToken);
    const reloaded = after.body.data.find((p: { driverId: string }) => p.driverId === target.driverId);
    expect(reloaded.unlockedBadges.some((b: { code: string }) => b.code === code)).toBe(true);
  });

  it('refuse de décorer un chauffeur d’une autre organisation', async () => {
    const otherToken = await tokenFor(TENANT_B_USER);
    const list = await profiles(adminToken);
    const target = list.body.data[0];

    const res = await request(app)
      .post(`/api/v1/rewards/profiles/${target.driverId}/badges`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ badgeCode: 'ZERO_OVERSPEED_30D' });

    // Deux barrières se présentent dans cet ordre : le rôle, puis
    // l'organisation. Ce compte est gestionnaire de flotte et n'a pas le droit
    // de décerner ; il serait de toute façon arrêté par la seconde.
    expect([403, 404]).toContain(res.status);

    // Ce qui compte reste vérifié : rien n'a été inscrit.
    const after = await profiles(adminToken);
    const reloaded = after.body.data.find((p: { driverId: string }) => p.driverId === target.driverId);
    expect(reloaded.unlockedBadges.some((b: { code: string }) => b.code === 'ZERO_OVERSPEED_30D')).toBe(
      false,
    );
  });

  it('ne montre pas les primes d’une organisation à une autre', async () => {
    const otherToken = await tokenFor(TENANT_B_USER);

    const mine = await profiles(adminToken);
    const theirs = await profiles(otherToken);

    const myDrivers = new Set(mine.body.data.map((p: { driverId: string }) => p.driverId));
    expect(theirs.body.data.some((p: { driverId: string }) => myDrivers.has(p.driverId))).toBe(false);
  });
});

describe.skipIf(!DATABASE_CONFIGURED)('Réseau de ravitaillement et fatigue', () => {
  let adminToken: string;

  beforeAll(async () => {
    app = await createApp();
    adminToken = await tokenFor('admin@transafrik.bj');
  });

  it('sert le réseau conventionné de l’organisation', async () => {
    const res = await request(app).get('/api/v1/fuel-stations').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);

    for (const station of res.body.data) {
      // Un tarif sans date de relevé ne permettrait aucune prévision de coût.
      if (station.dieselPrice !== undefined) {
        expect(station.priceObservedAt).toBeTruthy();
      }
      // Le niveau de stock a été retiré : aucun flux ne le renseigne.
      expect(station.fuelStockStatus).toBeUndefined();
    }
  });

  it('ne montre pas le réseau d’un transporteur à un autre', async () => {
    const otherToken = await tokenFor(TENANT_B_USER);

    const mine = await request(app).get('/api/v1/fuel-stations').set('Authorization', `Bearer ${adminToken}`);
    const theirs = await request(app)
      .get('/api/v1/fuel-stations')
      .set('Authorization', `Bearer ${otherToken}`);

    const myIds = new Set(mine.body.data.map((s: { id: string }) => s.id));
    expect(theirs.body.data.some((s: { id: string }) => myIds.has(s.id))).toBe(false);
  });

  it('mesure la fatigue sur les trajets reconstruits', async () => {
    const res = await request(app).get('/api/v1/fatigue').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.framework.maxDailyDrivingHours).toBeGreaterThan(0);
    expect(res.body.data.drivers.length).toBeGreaterThan(0);

    for (const driver of res.body.data.drivers) {
      // Un chauffeur sans trajet ne doit pas être présenté comme « peu fatigué » :
      // l'absence de mesure se dit.
      if (!driver.hasData) {
        expect(driver.primaryRecommendation).toContain('pas mesurable');
        expect(driver.hoursDrivenThisWeek).toBe(0);
      }
      // Un repos exigé sans conduite mesurée serait incohérent.
      if (driver.isMandatoryRestEnforced) {
        expect(driver.hasData).toBe(true);
      }
    }
  });

  it('applique le cadre réglementaire demandé', async () => {
    const eac = await request(app)
      .get('/api/v1/fatigue?region=EAC_EAST_AFRICA')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(eac.body.data.framework.region).toBe('EAC_EAST_AFRICA');
    expect(eac.body.data.framework.maxDailyDrivingHours).toBe(8);
  });

  it('ne mélange pas la charge de deux organisations', async () => {
    const otherToken = await tokenFor(TENANT_B_USER);

    const mine = await request(app).get('/api/v1/fatigue').set('Authorization', `Bearer ${adminToken}`);
    const theirs = await request(app).get('/api/v1/fatigue').set('Authorization', `Bearer ${otherToken}`);

    const myDrivers = new Set(mine.body.data.drivers.map((d: { driverId: string }) => d.driverId));
    expect(theirs.body.data.drivers.some((d: { driverId: string }) => myDrivers.has(d.driverId))).toBe(false);
  });
});

describe.skipIf(!DATABASE_CONFIGURED)('Console de bord du chauffeur', () => {
  let driverToken: string;
  let managerToken: string;

  beforeAll(async () => {
    app = await createApp();
    driverToken = await tokenFor('chauffeur@transafrik.bj');
    managerToken = await tokenFor('manager@transafrik.bj');
  });

  const assignment = (token: string) =>
    request(app).get('/api/v1/me/assignment').set('Authorization', `Bearer ${token}`);

  it('donne au chauffeur son affectation', async () => {
    const res = await assignment(driverToken);

    expect(res.status).toBe(200);
    expect(res.body.data.driverId).toBeTruthy();
    expect(res.body.data.vehicle).toBeTruthy();
    expect(res.body.data.safetyScore).toBeGreaterThan(0);
  });

  it('refuse l’affectation à un rôle de bureau', async () => {
    // `tracking:ingest` appartient au terrain. Un gestionnaire n'émet pas de
    // positions, et n'a donc pas d'affectation à consulter ici.
    const res = await assignment(managerToken);
    expect(res.status).toBe(403);
  });

  it('accepte les positions émises depuis le téléphone du chauffeur', async () => {
    const me = await assignment(driverToken);
    const base = Date.now() - 20 * 60_000;

    const res = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        batchId: `mob-test-${Date.now()}`,
        vehicleId: me.body.data.vehicle.id,
        driverId: me.body.data.driverId,
        points: [0, 1, 2].map(index => ({
          latitude: 6.37 + index * 0.004,
          longitude: 2.42 + index * 0.002,
          speedKmH: 62,
          headingDegree: 30,
          timestamp: new Date(base + index * 30_000).toISOString(),
          accuracyMeters: 8,
          ignitionOn: true,
          batteryLevelPct: 100,
          networkType: '4G',
        })),
      });

    expect(res.status).toBe(202);
    expect(res.body.data.persisted).toBe(true);
  });

  it('empêche un chauffeur d’attribuer sa conduite à un collègue', async () => {
    // Le point décisif : sans ce refus, n'importe quel compte pourrait faire
    // porter ses infractions — donc la perte de prime — par un autre.
    const others = await request(app).get('/api/v1/drivers').set('Authorization', `Bearer ${managerToken}`);
    const me = await assignment(driverToken);

    const someoneElse = others.body.data.find((d: { id: string }) => d.id !== me.body.data.driverId);

    const res = await request(app)
      .post('/api/v1/tracking/telemetry/batch')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        batchId: `mob-usurpation-${Date.now()}`,
        vehicleId: me.body.data.vehicle.id,
        driverId: someoneElse.id,
        points: [
          {
            latitude: 6.37,
            longitude: 2.42,
            speedKmH: 120,
            headingDegree: 30,
            timestamp: new Date().toISOString(),
            accuracyMeters: 8,
            ignitionOn: true,
            batteryLevelPct: 100,
            networkType: '4G',
          },
        ],
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('votre propre nom');
  });
});
