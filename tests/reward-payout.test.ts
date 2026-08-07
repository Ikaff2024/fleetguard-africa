import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';

/**
 * Versement des primes.
 *
 * Une prime est un salaire. Deux défauts la rendaient indéfendable :
 *
 * 1. l'écran proposait « Verser via Mobile Money », ce qui inscrivait la prime
 *    « versée » sans qu'un franc ne quitte l'entreprise. Le schéma du projet
 *    interdit pourtant ce moyen tant qu'aucun agrégateur agréé BCEAO n'est
 *    raccordé. Un chauffeur qui réclamait son dû se voyait opposer un
 *    enregistrement de paiement ;
 * 2. le statut de versement n'était rattaché à aucune période. Le montant du
 *    mois en cours s'affichait sous la mention « VERSÉ le 5 juillet », et le
 *    bouton d'approbation disparaissait — rendant le vrai versement impossible.
 */

const DATABASE_CONFIGURED = Boolean(process.env.DATABASE_APP_URL && process.env.JWT_SECRET);
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FleetGuard2026!Demo';

// La décision de versement engage une dépense : elle relève de la
// configuration de l'entreprise, pas de la lecture d'un classement.
const ADMIN = 'admin@transafrik.bj';
const MANAGER = 'manager@transafrik.bj';

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

async function profiles(email = ADMIN) {
  const res = await request(app)
    .get('/api/v1/rewards/profiles')
    .set('Authorization', `Bearer ${await tokenFor(email)}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data as {
    driverId: string;
    driverName: string;
    bonusEarned: number;
    eligible: boolean;
    payoutStatus: string;
    lastPayoutAt?: string;
    periodStart: string;
    periodEnd: string;
    paidAmount?: number;
  }[];
}

async function setPayout(driverId: string, body: Record<string, unknown>) {
  return request(app)
    .patch(`/api/v1/rewards/profiles/${driverId}`)
    .set('Authorization', `Bearer ${await tokenFor(ADMIN)}`)
    .send(body);
}

/** Remet la période à zéro pour que la suite puisse tourner indéfiniment. */
async function reset(driverId: string) {
  await setPayout(driverId, { payoutStatus: 'ELIGIBLE' });
}

beforeAll(async () => {
  app = await createApp();
});

describe.runIf(DATABASE_CONFIGURED)('Moyen de versement', () => {
  it('refuse la monnaie électronique tant qu’aucun agrégateur n’est raccordé', async () => {
    const [driver] = await profiles();
    const res = await setPayout(driver!.driverId, {
      payoutStatus: 'PAID',
      payoutMethod: 'ORANGE_MONEY',
    });

    expect(res.status).toBe(409);
    // Le motif doit être exploitable par un gestionnaire, pas un code d'erreur.
    expect(res.body.message).toMatch(/agrégateur/i);
  });

  it('refuse les trois opérateurs, pas seulement le premier', async () => {
    const [driver] = await profiles();
    for (const method of ['ORANGE_MONEY', 'MTN_MOMO', 'WAVE']) {
      const res = await setPayout(driver!.driverId, { payoutStatus: 'PAID', payoutMethod: method });
      expect(res.status, method).toBe(409);
    }
  });

  it('n’enregistre aucun versement quand le moyen est refusé', async () => {
    // C'est le point qui compte : un refus ne doit pas laisser une trace
    // partielle qui ferait croire à un paiement.
    const [driver] = await profiles();
    await reset(driver!.driverId);
    await setPayout(driver!.driverId, { payoutStatus: 'PAID', payoutMethod: 'WAVE' });

    const after = await profiles();
    const seen = after.find(p => p.driverId === driver!.driverId)!;
    expect(seen.payoutStatus).not.toBe('PAID');
    expect(seen.lastPayoutAt).toBeUndefined();
  });

  it('accepte le bon carburant', async () => {
    const [driver] = await profiles();
    const res = await setPayout(driver!.driverId, {
      payoutStatus: 'PAID',
      payoutMethod: 'FUEL_VOUCHER',
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await reset(driver!.driverId);
  });

  it('publie les moyens réellement disponibles avec les règles', async () => {
    const res = await request(app)
      .get('/api/v1/rewards/rules')
      .set('Authorization', `Bearer ${await tokenFor(MANAGER)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.availablePayoutMethods).toEqual(['FUEL_VOUCHER']);
  });
});

describe.runIf(DATABASE_CONFIGURED)('Versement rattaché à une période', () => {
  it('expose les bornes de la période que le montant récompense', async () => {
    const [driver] = await profiles();

    expect(driver!.periodStart).toBeTruthy();
    expect(driver!.periodEnd).toBeTruthy();
    expect(new Date(driver!.periodStart).getTime()).toBeLessThan(new Date(driver!.periodEnd).getTime());
  });

  it('n’affiche « versé » que pour la période effectivement payée', async () => {
    const eligible = (await profiles()).find(p => p.eligible);
    if (!eligible) return; // Aucun chauffeur éligible : rien à vérifier.

    await reset(eligible.driverId);
    const before = (await profiles()).find(p => p.driverId === eligible.driverId)!;
    expect(before.payoutStatus).not.toBe('PAID');
    expect(before.lastPayoutAt).toBeUndefined();

    await setPayout(eligible.driverId, { payoutStatus: 'PAID', payoutMethod: 'FUEL_VOUCHER' });

    const after = (await profiles()).find(p => p.driverId === eligible.driverId)!;
    expect(after.payoutStatus).toBe('PAID');
    expect(after.lastPayoutAt).toBeTruthy();
    // Le montant enregistré est celui figé à la décision, pas un recalcul.
    expect(after.paidAmount).toBeGreaterThan(0);

    await reset(eligible.driverId);
  });

  it('rend la prime à nouveau approuvable après annulation', async () => {
    /**
     * L'ancien défaut enfermait le gestionnaire : le statut « versé » d'une
     * période passée masquait le bouton, et la prime du mois en cours ne
     * pouvait plus être approuvée.
     */
    const eligible = (await profiles()).find(p => p.eligible);
    if (!eligible) return;

    await setPayout(eligible.driverId, { payoutStatus: 'PAID', payoutMethod: 'FUEL_VOUCHER' });
    await reset(eligible.driverId);

    const after = (await profiles()).find(p => p.driverId === eligible.driverId)!;
    expect(after.payoutStatus).toBe('ELIGIBLE');
    expect(after.lastPayoutAt).toBeUndefined();
  });

  it('réserve la décision de versement à la configuration de l’entreprise', async () => {
    // Consulter un classement n'est pas engager une dépense.
    const [driver] = await profiles();
    const res = await request(app)
      .patch(`/api/v1/rewards/profiles/${driver!.driverId}`)
      .set('Authorization', `Bearer ${await tokenFor(MANAGER)}`)
      .send({ payoutStatus: 'PAID', payoutMethod: 'FUEL_VOUCHER' });

    expect(res.status).toBe(403);
  });

  it('refuse un identifiant de chauffeur malformé sans tomber en panne', async () => {
    const res = await request(app)
      .patch('/api/v1/rewards/profiles/undefined')
      .set('Authorization', `Bearer ${await tokenFor(ADMIN)}`)
      .send({ payoutStatus: 'PAID' });

    expect(res.status).toBe(404);
  });
});
