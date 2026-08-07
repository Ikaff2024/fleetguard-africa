import type { $Enums } from '../../generated/prisma/client.js';
import { isDatabaseEnabled, withTenant } from '../db/prisma.js';

/**
 * Consignes adressées aux chauffeurs.
 *
 * Une consigne de sécurité transmise avant un départ finit, tôt ou tard, dans
 * un dossier : celui de l'assureur, de l'inspection du travail, ou du tribunal
 * après un accident. Ce qui lui donne sa valeur n'est pas qu'elle ait été
 * écrite, c'est qu'on puisse établir qu'elle a été reçue.
 *
 * D'où la seule règle qui gouverne ce fichier : **l'expéditeur n'écrit jamais
 * les horodatages de réception**. `deliveredAt`, `readAt` et `acknowledgedAt`
 * ne sont posés que par les fonctions appelées depuis le téléphone du
 * chauffeur, et uniquement sur ses propres consignes. Un gestionnaire qui
 * pourrait cocher « lu » à la place de son conducteur produirait une preuve
 * qui ne prouve rien.
 */

export class MessageNotFound extends Error {}

export interface DriverMessageRecord {
  id: string;
  driverId: string;
  driverName: string;
  senderName: string;
  category: $Enums.DriverMessageCategory;
  priority: $Enums.DriverMessagePriority;
  body: string;
  ackRequired: boolean;
  sentAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
}

interface RawMessage {
  id: string;
  driverId: string;
  senderName: string;
  category: $Enums.DriverMessageCategory;
  priority: $Enums.DriverMessagePriority;
  body: string;
  ackRequired: boolean;
  sentAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
  acknowledgedAt: Date | null;
  driver?: { fullName: string } | null;
}

function toRecord(row: RawMessage): DriverMessageRecord {
  return {
    id: row.id,
    driverId: row.driverId,
    driverName: row.driver?.fullName ?? '',
    senderName: row.senderName,
    category: row.category,
    priority: row.priority,
    body: row.body,
    ackRequired: row.ackRequired,
    sentAt: row.sentAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
  };
}

const SELECT = {
  id: true,
  driverId: true,
  senderName: true,
  category: true,
  priority: true,
  body: true,
  ackRequired: true,
  sentAt: true,
  deliveredAt: true,
  readAt: true,
  acknowledgedAt: true,
  driver: { select: { fullName: true } },
} as const;

export interface SendMessageInput {
  driverId: string;
  senderUserId: string | null;
  /** Utilisé seulement si le compte n'est plus lisible (jeton d'un compte supprimé). */
  senderFallbackName: string;
  category: $Enums.DriverMessageCategory;
  priority: $Enums.DriverMessagePriority;
  body: string;
  ackRequired: boolean;
}

/**
 * Enregistre une consigne.
 *
 * Le nom de l'expéditeur est relu dans la table des comptes plutôt que repris
 * de la requête : dans un dossier d'accident, une consigne dont l'auteur est
 * déclaré par l'appelant lui-même ne vaut rien.
 *
 * Aucun horodatage de réception n'est posé ici, pas même `deliveredAt` : à cet
 * instant, la consigne n'a pas quitté le serveur. C'est le téléphone du
 * chauffeur qui, en venant la chercher, établira qu'elle lui est parvenue.
 */
export async function sendMessage(
  organizationId: string,
  input: SendMessageInput,
): Promise<DriverMessageRecord> {
  return withTenant(organizationId, async tx => {
    const driver = await tx.driver.findFirst({
      where: { id: input.driverId, deletedAt: null },
      select: { id: true },
    });
    if (!driver) throw new MessageNotFound();

    const sender = input.senderUserId
      ? await tx.user.findFirst({
          where: { id: input.senderUserId },
          select: { fullName: true },
        })
      : null;

    const created = await tx.driverMessage.create({
      data: {
        organizationId,
        driverId: input.driverId,
        senderUserId: input.senderUserId,
        senderName: sender?.fullName ?? input.senderFallbackName,
        category: input.category,
        priority: input.priority,
        body: input.body,
        ackRequired: input.ackRequired,
      },
      select: SELECT,
    });

    return toRecord(created);
  });
}

/** Fil d'un chauffeur, ou de toute l'organisation si aucun n'est précisé. */
export async function listMessages(
  organizationId: string,
  options: { driverId?: string; limit?: number } = {},
): Promise<DriverMessageRecord[]> {
  if (!isDatabaseEnabled()) return [];

  return withTenant(organizationId, async tx => {
    const rows = await tx.driverMessage.findMany({
      where: options.driverId ? { driverId: options.driverId } : {},
      orderBy: { sentAt: 'desc' },
      take: options.limit ?? 200,
      select: SELECT,
    });
    return rows.map(toRecord).reverse();
  });
}

/**
 * Consignes destinées au chauffeur connecté, et constat de remise.
 *
 * Le seul fait de venir les chercher depuis son téléphone établit qu'elles lui
 * sont parvenues : `deliveredAt` est donc posé ici, une seule fois. La lecture
 * et la confirmation restent des gestes distincts — une consigne remise sur un
 * téléphone dans une poche n'a été lue par personne.
 */
export async function listMessagesForDriver(
  organizationId: string,
  driverId: string,
): Promise<DriverMessageRecord[]> {
  return withTenant(organizationId, async tx => {
    const now = new Date();

    await tx.driverMessage.updateMany({
      where: { driverId, deliveredAt: null },
      data: { deliveredAt: now },
    });

    const rows = await tx.driverMessage.findMany({
      where: { driverId },
      orderBy: { sentAt: 'desc' },
      take: 100,
      select: SELECT,
    });

    return rows.map(toRecord).reverse();
  });
}

type Receipt = 'read' | 'acknowledged';

/**
 * Constate une lecture ou une confirmation.
 *
 * `driverId` provient du jeton, jamais de la requête : sans cela, n'importe
 * quel compte pourrait signer l'accusé d'un collègue, et la preuve
 * s'effondrerait. Chaque horodatage n'est écrit qu'une fois — on constate le
 * premier moment où le chauffeur a vu la consigne, pas le dernier.
 */
export async function markReceipt(
  organizationId: string,
  driverId: string,
  messageId: string,
  receipt: Receipt,
): Promise<DriverMessageRecord> {
  return withTenant(organizationId, async tx => {
    const existing = await tx.driverMessage.findFirst({
      where: { id: messageId, driverId },
      select: { id: true, readAt: true, acknowledgedAt: true },
    });
    if (!existing) throw new MessageNotFound();

    const now = new Date();
    const data: { deliveredAt?: Date; readAt?: Date; acknowledgedAt?: Date } = {};

    // Confirmer suppose avoir lu : le cas se présente si le chauffeur appuie
    // sur « J'ai pris connaissance » avant que la lecture n'ait été remontée.
    if (!existing.readAt) data.readAt = now;
    if (receipt === 'acknowledged' && !existing.acknowledgedAt) data.acknowledgedAt = now;

    const updated = await tx.driverMessage.update({
      where: { id: messageId },
      data,
      select: SELECT,
    });

    return toRecord(updated);
  });
}
