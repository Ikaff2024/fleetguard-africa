import { Router } from 'express';
import { isDatabaseEnabled, withTenant } from '../db/prisma.js';
import { ApiError, asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import { toNumber } from '../repositories/mappers.js';

export const driverConsoleRouter = Router();

/**
 * Affectation du chauffeur connecté.
 *
 * La console de bord embarquée dans le téléphone du conducteur a besoin de
 * savoir pour qui et pour quel véhicule elle émet : sans ce lien, les positions
 * arriveraient orphelines, et ni le score ni les trajets ne pourraient leur
 * être rattachés.
 *
 * Le chauffeur est déduit du jeton, jamais transmis par l'appelant. Laisser le
 * client désigner le chauffeur permettrait à n'importe quel compte d'attribuer
 * sa conduite — donc ses infractions — à un collègue.
 */
driverConsoleRouter.get(
  '/me/assignment',
  resolveTenant,
  requirePermission('tracking:ingest'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const userId = req.auth?.userId;

    if (!isDatabaseEnabled() || !userId) {
      throw ApiError.serviceUnavailable(
        'La console de bord requiert une base de données et une session authentifiée.',
      );
    }

    const assignment = await withTenant(organizationId, async tx => {
      const driver = await tx.driver.findFirst({
        where: { userId, deletedAt: null },
        include: {
          assignedVehicle: {
            select: { id: true, immatriculation: true, make: true, model: true },
          },
        },
      });

      if (!driver) return null;

      return {
        driverId: driver.id,
        driverName: driver.fullName,
        safetyScore: toNumber(driver.currentSafetyScore),
        vehicle: driver.assignedVehicle
          ? {
              id: driver.assignedVehicle.id,
              immatriculation: driver.assignedVehicle.immatriculation,
              label: `${driver.assignedVehicle.make} ${driver.assignedVehicle.model}`,
            }
          : null,
      };
    });

    if (!assignment) {
      // Le dire plutôt que d'inventer une affectation : un chauffeur non
      // rattaché doit être signalé au gestionnaire, pas émettre dans le vide.
      throw ApiError.notFound(
        'Aucune fiche chauffeur n’est rattachée à ce compte. Demandez à votre gestionnaire de flotte de faire le rattachement.',
      );
    }

    res.json({ statusCode: 200, data: assignment });
  }),
);
