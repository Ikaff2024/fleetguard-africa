import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import {
  MissionNotFeasible,
  MissionNotFound,
  assess,
  createMission,
  listMissions,
  updateMissionStatus,
} from '../repositories/mission-repository.js';

export const missionsRouter = Router();

const missionInput = z.object({
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  originLabel: z.string().trim().min(2).max(120),
  destinationLabel: z.string().trim().min(2).max(120),
  plannedDistanceKm: z.number().positive().max(10_000),
  scheduledStart: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(1000).optional(),
  overrideReason: z.string().trim().min(10).max(1000).optional(),
  region: z.enum(['UEMOA_CEDEAO', 'EAC_EAST_AFRICA', 'SADC_SOUTHERN'] as const).optional(),
});

/** Missions planifiées, de la plus proche à la plus lointaine. */
missionsRouter.get(
  '/missions',
  resolveTenant,
  requirePermission('fleet:read'),
  asyncHandler(async (req, res) => {
    res.json({ statusCode: 200, data: await listMissions(requireTenantId(req)) });
  }),
);

/**
 * Évaluation sans écriture.
 *
 * L'écran interroge avant de proposer d'enregistrer : un gestionnaire doit
 * savoir qu'une affectation est impossible pendant qu'il la compose, pas après
 * l'avoir validée.
 */
missionsRouter.post(
  '/missions/assess',
  resolveTenant,
  requirePermission('fleet:read'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    res.json({ statusCode: 200, data: await assess(organizationId, missionInput.parse(req.body)) });
  }),
);

missionsRouter.post(
  '/missions',
  resolveTenant,
  requirePermission('fleet:write'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);

    try {
      const created = await createMission(organizationId, missionInput.parse(req.body), req.auth?.userId);
      res.status(201).json({ statusCode: 201, data: created });
    } catch (err) {
      if (err instanceof MissionNotFeasible) {
        // 409 plutôt que 400 : la demande est bien formée, c'est l'état de la
        // flotte qui s'y oppose. Le détail permet à l'écran d'expliquer.
        throw ApiError.conflict(
          'Cette mission dépasserait les plafonds de conduite. Un motif écrit est requis pour la valider malgré tout.',
          err.feasibility,
        );
      }
      throw err;
    }
  }),
);

missionsRouter.patch(
  '/missions/:id',
  resolveTenant,
  requirePermission('fleet:write'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const { status } = z
      .object({ status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const) })
      .parse(req.body);

    try {
      await updateMissionStatus(organizationId, req.params.id!, status);
    } catch (err) {
      if (err instanceof MissionNotFound) throw ApiError.notFound('Mission introuvable.');
      throw err;
    }

    res.json({ statusCode: 200, data: { updated: true } });
  }),
);
