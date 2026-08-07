import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';

/**
 * Carnet d'entretien.
 *
 * L'écran affichait la ligne saisie, l'ajoutait aux totaux et l'imprimait dans
 * un document présenté comme réglementaire — le tout dans l'état du navigateur,
 * sans qu'aucune route d'écriture n'existe côté serveur. Au rechargement de la
 * page, l'intervention avait disparu.
 *
 * Un carnet sert à prouver qu'une révision a eu lieu : devant un assureur après
 * un accident de freinage, devant un acheteur qui reprend le camion, devant
 * l'inspection technique. Un carnet qui oublie ne sert à rien ; un carnet qui
 * affirme se souvenir est pire.
 */

const DATABASE_CONFIGURED = Boolean(process.env.DATABASE_APP_URL && process.env.JWT_SECRET);
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FleetGuard2026!Demo';

/**
 * Les écritures ont lieu dans le bac à sable, jamais dans le parc de
 * démonstration. Emprunter un camion réel revenait à pousser son compteur à
 * 211 000 km et à empiler des interventions de contrôle dans un carnet que
 * l'utilisateur consulte.
 */
const TECH = 'atelier@sandbox.fleetguard.local';
const SANDBOX_MANAGER = 'manager@sandbox.fleetguard.local';
const OTHER_ORG = 'manager@sahelexpress.sn';

let app: Express;
const tokens = new Map<string, string>();

async function tokenFor(email: string): Promise<string> {
  if (!tokens.has(email)) {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: SEED_PASSWORD });
    expect(res.status, `connexion ${email} : ${JSON.stringify(res.body)}`).toBe(200);
    tokens.set(email, res.body.data.accessToken);
  }
  return tokens.get(email)!;
}

/**
 * Véhicule créé pour cette suite, et pour elle seule.
 *
 * Emprunter un camion du parc de démonstration reviendrait à pousser son
 * compteur à 211 000 km et à empiler des interventions de contrôle dans un
 * carnet que l'utilisateur consulte — c'est-à-dire à fabriquer les données que
 * ces tests servent justement à protéger.
 */
let dedicatedVehicleId: string;

/** Description unique : la suite doit pouvoir tourner plusieurs fois de suite. */
const uniqueDescription = () => `Contrôle de persistance ${Date.now()}-${Math.random()}`;

beforeAll(async () => {
  app = await createApp();
  if (!DATABASE_CONFIGURED) return;

  const suffix = `${Date.now()}`.slice(-8);
  // La création d'un véhicule demande `fleet:write`, que le rôle atelier n'a
  // pas : le gestionnaire prépare le terrain, le technicien écrit le carnet.
  const res = await request(app)
    .post('/api/v1/vehicles')
    .set('Authorization', `Bearer ${await tokenFor(SANDBOX_MANAGER)}`)
    .send({
      immatriculation: `MT-${suffix}`,
      vin: `VINMAINT${suffix}`,
      make: 'Test',
      model: 'Véhicule de carnet',
      year: 2024,
      type: 'HEAVY_TRUCK',
      fuelType: 'DIESEL',
      tankCapacityLiters: 400,
      expectedConsumptionL100km: 35,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  dedicatedVehicleId = res.body.data.id;
});

afterAll(async () => {
  if (!dedicatedVehicleId) return;
  await request(app)
    .delete(`/api/v1/vehicles/${dedicatedVehicleId}`)
    .set('Authorization', `Bearer ${await tokenFor(SANDBOX_MANAGER)}`);
});

describe.runIf(DATABASE_CONFIGURED)('Enregistrement d’un passage à l’atelier', () => {
  it('survit au rechargement de l’écran', async () => {
    // L'invariant qui remplace le défaut : après écriture, une relecture
    // indépendante doit retrouver l'intervention.
    const vehicleId = dedicatedVehicleId;
    const description = uniqueDescription();

    const created = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${await tokenFor(TECH)}`)
      .send({
        vehicleId,
        type: 'BRAKE_SERVICE',
        description,
        odometerKmAtService: 210_000,
        cost: 240_000,
        serviceProvider: 'Atelier de contrôle',
      });

    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const reread = await request(app)
      .get('/api/v1/maintenance')
      .set('Authorization', `Bearer ${await tokenFor(TECH)}`);

    expect(reread.body.data.some((log: { description: string }) => log.description === description)).toBe(
      true,
    );
  });

  it('n’invente ni note de mécanicien ni prochaine échéance', async () => {
    /**
     * L'écran remplissait « Entretien réalisé selon les normes constructeur »
     * au nom d'un mécanicien qui n'avait rien écrit, et posait une échéance à
     * +15 000 km identique pour un tracteur routier et un utilitaire.
     */
    const vehicleId = dedicatedVehicleId;
    const description = uniqueDescription();

    const created = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${await tokenFor(TECH)}`)
      .send({
        vehicleId,
        type: 'OIL_CHANGE',
        description,
        odometerKmAtService: 211_000,
        cost: 90_000,
        serviceProvider: 'Atelier de contrôle',
      });

    expect(created.status).toBe(201);
    expect(created.body.data.technicianNotes ?? null).toBeNull();
    expect(created.body.data.nextServiceKmDue ?? null).toBeNull();
  });

  it('fait suivre le compteur du véhicule, sans jamais le faire reculer', async () => {
    const vehicleId = dedicatedVehicleId;
    const before = await request(app)
      .get('/api/v1/vehicles')
      .set('Authorization', `Bearer ${await tokenFor(TECH)}`);
    const odometerBefore = before.body.data.find((v: { id: string }) => v.id === vehicleId).currentOdometerKm;

    // Un relevé inférieur ne doit pas écraser le kilométrage déjà remonté.
    await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${await tokenFor(TECH)}`)
      .send({
        vehicleId,
        type: 'CORRECTIVE',
        description: uniqueDescription(),
        odometerKmAtService: 1,
        cost: 1000,
        serviceProvider: 'Atelier de contrôle',
      });

    const after = await request(app)
      .get('/api/v1/vehicles')
      .set('Authorization', `Bearer ${await tokenFor(TECH)}`);
    const odometerAfter = after.body.data.find((v: { id: string }) => v.id === vehicleId).currentOdometerKm;

    expect(odometerAfter).toBeGreaterThanOrEqual(odometerBefore);
  });

  it('refuse d’écrire dans le carnet d’une autre organisation', async () => {
    const vehicleId = dedicatedVehicleId;

    const res = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${await tokenFor(OTHER_ORG)}`)
      .send({
        vehicleId,
        type: 'PREVENTATIVE',
        description: uniqueDescription(),
        odometerKmAtService: 100_000,
        cost: 50_000,
        serviceProvider: 'Atelier extérieur',
      });

    // Soit le rôle n'a pas le droit d'écrire, soit le véhicule reste
    // introuvable derrière le cloisonnement : aucune écriture ne doit passer.
    expect([403, 404]).toContain(res.status);
  });

  it('refuse une saisie incomplète plutôt que de la compléter elle-même', async () => {
    const vehicleId = dedicatedVehicleId;

    const res = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${await tokenFor(TECH)}`)
      .send({ vehicleId, type: 'PREVENTATIVE', description: 'x' });

    expect(res.status).toBe(400);
  });
});
