import type { Request } from 'express';
import { isDatabaseEnabled, withTenant } from '../db/prisma.js';
import { logger } from '../logger.js';

/**
 * Journal d'audit.
 *
 * Exigé dès lors que la plateforme traite des positions nominatives : il faut
 * pouvoir répondre à « qui a consulté la position de ce chauffeur, et quand ».
 * La table est en insertion seule (voir 001_rls_policies.sql) : une trace
 * écrite ne peut plus être modifiée ni supprimée par l'application.
 */
export interface AuditEntry {
  organizationId: string;
  userId?: string;
  userEmail: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

/**
 * Enregistre une action sensible.
 *
 * Volontairement non bloquant : un échec d'écriture du journal ne doit pas
 * faire échouer l'action métier de l'utilisateur, mais il est journalisé au
 * niveau `error` pour être détecté par la supervision.
 */
export async function recordAudit(entry: AuditEntry, req?: Request): Promise<void> {
  if (!isDatabaseEnabled()) return;

  try {
    await withTenant(entry.organizationId, async tx => {
      await tx.auditLog.create({
        data: {
          organizationId: entry.organizationId,
          userId: entry.userId,
          userEmail: entry.userEmail,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          ipAddress: req?.ip,
          userAgent: req?.headers['user-agent'],
          details: entry.details ? JSON.parse(JSON.stringify(entry.details)) : undefined,
        },
      });
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, "Échec d'écriture du journal d'audit");
  }
}
