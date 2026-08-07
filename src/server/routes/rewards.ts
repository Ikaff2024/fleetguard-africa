import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors.js';
import { requirePermission } from '../http/rbac.js';
import { requireTenantId, resolveTenant } from '../http/tenant.js';
import {
  AVAILABLE_PAYOUT_METHODS,
  PayoutMethodUnavailable,
  effectiveBonusRules,
  BadgeNotFound,
  DriverNotFound,
  grantBadge,
  listBadges,
  listRewardProfiles,
  updatePayout,
} from '../repositories/rewards-repository.js';
import { requireResourceId } from '../http/params.js';

export const rewardsRouter = Router();

/**
 * Primes de conduite économe.
 *
 * Le montant se calcule sur les pleins réellement enregistrés et la distance
 * réellement parcourue. Un chauffeur sans plein relevé n'apparaît pas comme
 * éligible : le motif est renvoyé avec le profil, parce qu'une prime nulle doit
 * pouvoir s'expliquer à celui qui l'attendait.
 */
rewardsRouter.get(
  '/rewards/profiles',
  resolveTenant,
  requirePermission('scoring:read'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    // Le classement doit être calculé au prix affiché par l'écran des règles :
    // deux prix différents rendraient le montant invérifiable.
    res.json({
      statusCode: 200,
      data: await listRewardProfiles(organizationId, await effectiveBonusRules(organizationId)),
    });
  }),
);

/** Catalogue des distinctions et critères d'obtention. */
rewardsRouter.get(
  '/rewards/badges',
  resolveTenant,
  requirePermission('scoring:read'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    res.json({ statusCode: 200, data: await listBadges(organizationId) });
  }),
);

/**
 * Règles de partage en vigueur.
 *
 * Elles sont exposées pour être affichées, non pour être devinées : un
 * chauffeur doit pouvoir lire à quelles conditions il touche sa prime.
 */
rewardsRouter.get(
  '/rewards/rules',
  resolveTenant,
  requirePermission('scoring:read'),
  asyncHandler(async (req, res) => {
    /**
     * Les règles servent à expliquer un montant à un chauffeur : l'écran doit
     * pouvoir refaire l'opération complète, prime de base comprise, et savoir
     * quels moyens de versement sont réellement ouverts.
     */
    const rules = await effectiveBonusRules(requireTenantId(req));
    res.json({
      statusCode: 200,
      data: { ...rules, availablePayoutMethods: AVAILABLE_PAYOUT_METHODS },
    });
  }),
);

const payoutSchema = z.object({
  payoutStatus: z.enum(['ELIGIBLE', 'CALCULATED', 'APPROVED', 'PAID', 'ON_HOLD'] as const),
  payoutMethod: z.enum(['ORANGE_MONEY', 'MTN_MOMO', 'WAVE', 'FUEL_VOUCHER'] as const).optional(),
});

/**
 * Décision de versement.
 *
 * Elle relève de la configuration de l'organisation, pas de la simple lecture
 * du classement : engager une dépense n'est pas consulter un tableau.
 */
rewardsRouter.patch(
  '/rewards/profiles/:driverId',
  resolveTenant,
  requirePermission('organization:configure'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const payload = payoutSchema.parse(req.body);

    try {
      await updatePayout(
        organizationId,
        requireResourceId(req, 'Chauffeur', 'driverId'),
        payload,
        req.auth?.userId,
      );
    } catch (err) {
      if (err instanceof DriverNotFound) {
        throw ApiError.notFound('Chauffeur introuvable dans cette organisation.');
      }
      if (err instanceof PayoutMethodUnavailable) {
        // 409 plutôt que 400 : la demande est bien formée, c'est l'état du
        // produit qui s'y oppose — aucun agrégateur n'est raccordé.
        throw ApiError.conflict(err.message, { availableMethods: AVAILABLE_PAYOUT_METHODS });
      }
      throw err;
    }

    const profiles = await listRewardProfiles(organizationId);
    res.json({
      statusCode: 200,
      data: profiles.find(profile => profile.driverId === req.params.driverId),
    });
  }),
);

/** Attribution d'une distinction à un chauffeur. */
rewardsRouter.post(
  '/rewards/profiles/:driverId/badges',
  resolveTenant,
  requirePermission('scoring:configure'),
  asyncHandler(async (req, res) => {
    const organizationId = requireTenantId(req);
    const { badgeCode } = z.object({ badgeCode: z.string().min(1).max(64) }).parse(req.body);

    try {
      await grantBadge(organizationId, req.params.driverId!, badgeCode, req.auth?.userId ?? 'system');
    } catch (err) {
      if (err instanceof DriverNotFound) {
        throw ApiError.notFound('Chauffeur introuvable dans cette organisation.');
      }
      if (err instanceof BadgeNotFound) {
        throw ApiError.notFound('Distinction inconnue au catalogue.');
      }
      throw err;
    }

    const profiles = await listRewardProfiles(organizationId);
    res.status(201).json({
      statusCode: 201,
      data: profiles.find(profile => profile.driverId === req.params.driverId),
    });
  }),
);
