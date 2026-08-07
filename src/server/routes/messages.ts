import { Router } from 'express';
import { z } from 'zod';
import { isDatabaseEnabled } from '../db/prisma.js';
import { ApiError, asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { findDriverForUser } from '../repositories/driver-identity.js';
import {
  MessageNotFound,
  listMessages,
  listMessagesForDriver,
  markReceipt,
  sendMessage,
} from '../repositories/message-repository.js';

/**
 * Consignes aux chauffeurs.
 *
 * Deux familles de routes, et la frontière entre les deux est ce qui donne sa
 * valeur à l'accusé de réception :
 *
 * - le bureau écrit la consigne et lit son état, sans jamais pouvoir toucher
 *   aux horodatages de réception ;
 * - le chauffeur, sous son propre jeton, constate la remise, la lecture et la
 *   confirmation de ses seules consignes.
 *
 * Aucune route ne permet d'écrire « lu » sur la consigne d'un tiers.
 */
export const messagesRouter = Router();

const CATEGORIES = [
  'SAFETY_REMINDER',
  'MISSION_UPDATE',
  'FUEL_INSTRUCTION',
  'MAINTENANCE_NOTICE',
  'GENERAL',
] as const;

const PRIORITIES = ['NORMAL', 'URGENT', 'CRITICAL'] as const;

const messageInput = z.object({
  driverId: z.string().uuid(),
  category: z.enum(CATEGORIES).default('GENERAL'),
  priority: z.enum(PRIORITIES).default('NORMAL'),
  body: z.string().trim().min(3).max(2000),
  ackRequired: z.boolean().default(false),
});

function requireDatabase(): void {
  if (!isDatabaseEnabled()) {
    throw ApiError.serviceUnavailable('Les consignes requièrent une base de données.');
  }
}

/** Fil d'un chauffeur, ou de toute l'organisation. */
messagesRouter.get(
  '/messages',
  resolveTenant,
  requirePermission('messages:read'),
  asyncHandler(async (req, res) => {
    const driverId = z.string().uuid().optional().parse(req.query.driverId);
    res.json({
      statusCode: 200,
      data: await listMessages(requireTenantId(req), { driverId }),
    });
  }),
);

/**
 * Envoi d'une consigne.
 *
 * Le nom de l'expéditeur est repris du jeton, jamais du corps de la requête :
 * une consigne dont l'auteur est déclaré par l'appelant ne vaut rien dans un
 * dossier.
 */
messagesRouter.post(
  '/messages',
  resolveTenant,
  requirePermission('messages:send'),
  asyncHandler(async (req, res) => {
    requireDatabase();
    const input = messageInput.parse(req.body);
    const organizationId = requireTenantId(req);

    try {
      const message = await sendMessage(organizationId, {
        ...input,
        senderUserId: req.auth?.userId ?? null,
        senderFallbackName: req.auth?.email ?? 'Exploitation',
      });
      res.status(201).json({ statusCode: 201, data: message });
    } catch (error) {
      if (error instanceof MessageNotFound) {
        throw ApiError.notFound('Chauffeur introuvable dans cette organisation.');
      }
      throw error;
    }
  }),
);

/**
 * Consignes du chauffeur connecté.
 *
 * Le chauffeur est déduit du jeton. Venir chercher ses consignes établit
 * qu'elles lui sont parvenues : c'est ici, et nulle part ailleurs, que la
 * remise est constatée.
 */
messagesRouter.get(
  '/me/messages',
  resolveTenant,
  requirePermission('messages:read'),
  asyncHandler(async (req, res) => {
    requireDatabase();
    const organizationId = requireTenantId(req);
    const userId = req.auth?.userId;

    if (!userId) throw ApiError.unauthorized('Session requise.');

    const driver = await findDriverForUser(organizationId, userId);
    if (!driver) {
      throw ApiError.forbidden('Aucune fiche chauffeur n’est rattachée à ce compte.');
    }

    res.json({
      statusCode: 200,
      data: await listMessagesForDriver(organizationId, driver.id),
    });
  }),
);

/**
 * Lecture et confirmation.
 *
 * Le chauffeur ne peut agir que sur ses propres consignes : `markReceipt`
 * filtre sur le chauffeur déduit du jeton, si bien qu'un identifiant de
 * consigne appartenant à un collègue ne trouve simplement rien.
 */
messagesRouter.post(
  '/me/messages/:id/receipt',
  resolveTenant,
  requirePermission('messages:read'),
  asyncHandler(async (req, res) => {
    requireDatabase();
    const organizationId = requireTenantId(req);
    const userId = req.auth?.userId;
    const messageId = z.string().uuid().parse(req.params.id);
    const { receipt } = z.object({ receipt: z.enum(['read', 'acknowledged']) }).parse(req.body);

    if (!userId) throw ApiError.unauthorized('Session requise.');

    const driver = await findDriverForUser(organizationId, userId);
    if (!driver) {
      throw ApiError.forbidden('Aucune fiche chauffeur n’est rattachée à ce compte.');
    }

    try {
      const message = await markReceipt(organizationId, driver.id, messageId, receipt);
      res.json({ statusCode: 200, data: message });
    } catch (error) {
      if (error instanceof MessageNotFound) {
        throw ApiError.notFound('Consigne introuvable.');
      }
      throw error;
    }
  }),
);
