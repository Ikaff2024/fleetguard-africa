import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';

/**
 * Consignes aux chauffeurs.
 *
 * L'écran affichait auparavant « Accusé de Lecture Signé » deux secondes après
 * l'envoi, sans qu'aucun chauffeur n'ait rien vu. Un exploitant transmettait
 * « fortes pluies, réduisez à 60 km/h » et lisait que son conducteur avait
 * signé. Après un accident, l'entreprise aurait produit la preuve d'un
 * avertissement qui n'avait jamais quitté le serveur.
 *
 * Ces contrôles portent donc sur une seule chose, celle qui donne sa valeur à
 * un accusé de réception : **l'expéditeur ne peut pas le produire lui-même**.
 */

const DATABASE_CONFIGURED = Boolean(process.env.DATABASE_APP_URL && process.env.JWT_SECRET);
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FleetGuard2026!Demo';

const MANAGER = 'manager@transafrik.bj';
const DRIVER_ACCOUNT = 'chauffeur@transafrik.bj';
const OTHER_ORG_DRIVER = 'chauffeur@sahelexpress.sn';
const OTHER_ORG_MANAGER = 'manager@sahelexpress.sn';

let app: Express;
const tokens = new Map<string, string>();

async function as(email: string): Promise<Record<string, string>> {
  if (!tokens.has(email)) {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: SEED_PASSWORD });
    expect(res.status, `connexion ${email} : ${JSON.stringify(res.body)}`).toBe(200);
    tokens.set(email, res.body.data.accessToken);
  }
  return { Authorization: `Bearer ${tokens.get(email)}` };
}

/** Fiche du chauffeur rattachée au compte conducteur du jeu de démonstration. */
async function driverIdOfConsoleUser(): Promise<string> {
  const res = await request(app)
    .get('/api/v1/me/assignment')
    .set(await as(DRIVER_ACCOUNT));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.driverId as string;
}

/**
 * Envoie une consigne et renvoie son état initial.
 *
 * Le corps est rendu unique à chaque exécution : la suite doit pouvoir tourner
 * plusieurs fois de suite sans que ses propres traces la perturbent.
 */
async function sendInstruction(overrides: Record<string, unknown> = {}) {
  const driverId = await driverIdOfConsoleUser();
  const res = await request(app)
    .post('/api/v1/messages')
    .set(await as(MANAGER))
    .send({
      driverId,
      category: 'SAFETY_REMINDER',
      priority: 'CRITICAL',
      body: `Fortes pluies sur la traversée, réduisez à 60 km/h. [${Date.now()}-${Math.random()}]`,
      ackRequired: true,
      ...overrides,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { driverId, message: res.body.data };
}

beforeAll(async () => {
  app = await createApp();
});

describe.runIf(DATABASE_CONFIGURED)('Accusé de réception d’une consigne', () => {
  it('n’est pas signé à l’envoi', async () => {
    // C'est l'invariant qui remplace la fabrication : à cet instant, la
    // consigne n'a pas quitté le serveur. Rien ne peut être constaté.
    const { message } = await sendInstruction();

    expect(message.deliveredAt).toBeNull();
    expect(message.readAt).toBeNull();
    expect(message.acknowledgedAt).toBeNull();
  });

  it('ne se signe pas tout seul avec le temps qui passe', async () => {
    // L'ancien écran signait après 2,8 secondes. On laisse passer ce délai.
    const { message } = await sendInstruction();
    await new Promise(resolve => setTimeout(resolve, 3200));

    const res = await request(app)
      .get('/api/v1/messages')
      .set(await as(MANAGER));
    const seen = res.body.data.find((m: { id: string }) => m.id === message.id);

    expect(seen.acknowledgedAt).toBeNull();
    expect(seen.readAt).toBeNull();
    // Délai explicite : ce contrôle attend volontairement plus longtemps que
    // l'ancien minuteur, ce qui dépasse la limite par défaut d'un test.
  }, 20_000);

  it('constate la remise quand le téléphone vient chercher la consigne', async () => {
    const { message } = await sendInstruction();

    const res = await request(app)
      .get('/api/v1/me/messages')
      .set(await as(DRIVER_ACCOUNT));
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const received = res.body.data.find((m: { id: string }) => m.id === message.id);
    expect(received, 'la consigne doit parvenir au chauffeur').toBeDefined();

    // Remise n'est pas lue : un téléphone dans une poche n'a rien montré.
    expect(received.deliveredAt).not.toBeNull();
    expect(received.acknowledgedAt).toBeNull();
  });

  it('n’est signé que par le geste du chauffeur', async () => {
    const { message } = await sendInstruction();

    const res = await request(app)
      .post(`/api/v1/me/messages/${message.id}/receipt`)
      .set(await as(DRIVER_ACCOUNT))
      .send({ receipt: 'acknowledged' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.acknowledgedAt).not.toBeNull();
    // Confirmer suppose avoir vu : la lecture est constatée en même temps.
    expect(res.body.data.readAt).not.toBeNull();
  });

  it('conserve l’heure du premier constat, pas du dernier', async () => {
    // Ce qui compte dans un dossier, c'est le moment où le chauffeur a pris
    // connaissance de la consigne — pas celui où il a rouvert l'écran.
    const { message } = await sendInstruction();
    const first = await request(app)
      .post(`/api/v1/me/messages/${message.id}/receipt`)
      .set(await as(DRIVER_ACCOUNT))
      .send({ receipt: 'acknowledged' });

    await new Promise(resolve => setTimeout(resolve, 1100));

    const second = await request(app)
      .post(`/api/v1/me/messages/${message.id}/receipt`)
      .set(await as(DRIVER_ACCOUNT))
      .send({ receipt: 'acknowledged' });

    expect(second.body.data.acknowledgedAt).toBe(first.body.data.acknowledgedAt);
  }, 20_000);

  it('ne peut pas être signé par le gestionnaire qui a envoyé la consigne', async () => {
    // Un exploitant qui pourrait cocher « lu » à la place de son conducteur
    // produirait une preuve qui ne prouve rien. Le rôle n'a pas de fiche
    // chauffeur : la route le refuse.
    const { message } = await sendInstruction();

    const res = await request(app)
      .post(`/api/v1/me/messages/${message.id}/receipt`)
      .set(await as(MANAGER))
      .send({ receipt: 'acknowledged' });

    expect(res.status).toBe(403);
  });

  it('ne peut pas être signé par un collègue', async () => {
    const { message } = await sendInstruction();

    const res = await request(app)
      .post(`/api/v1/me/messages/${message.id}/receipt`)
      .set(await as(OTHER_ORG_DRIVER))
      .send({ receipt: 'acknowledged' });

    // Le chauffeur est déduit du jeton : l'identifiant d'un tiers ne trouve
    // rien, quel que soit le message visé.
    expect([403, 404]).toContain(res.status);
  });
});

describe.runIf(DATABASE_CONFIGURED)('Consignes et cloisonnement', () => {
  it('n’expose pas les consignes d’une autre organisation', async () => {
    const { message } = await sendInstruction();

    const res = await request(app)
      .get('/api/v1/messages')
      .set(await as(OTHER_ORG_MANAGER));

    expect(res.status).toBe(200);
    expect(res.body.data.map((m: { id: string }) => m.id)).not.toContain(message.id);
  });

  it('refuse d’adresser une consigne au chauffeur d’une autre organisation', async () => {
    const driverId = await driverIdOfConsoleUser();

    const res = await request(app)
      .post('/api/v1/messages')
      .set(await as(OTHER_ORG_MANAGER))
      .send({ driverId, body: 'Consigne adressée hors de mon organisation.' });

    expect(res.status).toBe(404);
  });

  it('n’autorise pas un chauffeur à envoyer une consigne', async () => {
    const driverId = await driverIdOfConsoleUser();

    const res = await request(app)
      .post('/api/v1/messages')
      .set(await as(DRIVER_ACCOUNT))
      .send({ driverId, body: 'Consigne rédigée par un conducteur.' });

    expect(res.status).toBe(403);
  });

  it('inscrit l’auteur d’après le compte, pas d’après la requête', async () => {
    // Une consigne dont l'auteur est déclaré par l'appelant ne vaut rien dans
    // un dossier : le nom est relu dans la table des comptes.
    const { message } = await sendInstruction({ senderName: 'Quelqu’un d’autre' });

    expect(message.senderName).not.toBe('Quelqu’un d’autre');
    expect(message.senderName.length).toBeGreaterThan(0);
  });
});
