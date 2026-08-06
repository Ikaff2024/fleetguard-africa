import type { $Enums } from '../../generated/prisma/client.js';
import { isDatabaseEnabled, withTenant } from '../db/prisma.js';
import {
  type BonusRules,
  DEFAULT_BONUS_RULES,
  type DriverFuelUsage,
  buildLeaderboard,
} from '../services/rewards-builder.js';
import { toNumber } from './mappers.js';

/**
 * Primes et classement.
 *
 * Comme pour les alertes, deux natures cohabitent : le calcul se refait à
 * chaque consultation — les seuils évoluent, les pleins arrivent en retard du
 * terrain — tandis que le versement est une décision qui engage l'entreprise et
 * ne se recalcule pas.
 */

export interface RewardProfile {
  driverId: string;
  driverName: string;
  assignedVehicle: string;
  currentSafetyScore: number;
  scoreTrend30d: number;
  ecoScore: number;
  fuelEfficiencySavingsL100km: number;
  estimatedFuelSavedLiters: number;
  bonusEarned: number;
  currency: string;
  eligible: boolean;
  ineligibilityReason?: string;
  payoutStatus: string;
  payoutMethod: string;
  lastPayoutAt?: string;
  totalPoints: number;
  rankInCompany: number;
  unlockedBadges: { badgeId: string; code: string; title: string; unlockedAt: string }[];
}

/** Période de référence des primes : le cycle mensuel du partage de gain. */
const PERIOD_DAYS = 30;

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/**
 * Consommation réellement constatée par chauffeur.
 *
 * Elle vient des pleins enregistrés, pas d'une estimation. La distance provient
 * des trajets reconstruits — donc du terrain — plutôt que de l'odomètre saisi à
 * la main, plus facile à se tromper.
 */
async function collectUsage(tx: Tx, since: Date): Promise<DriverFuelUsage[]> {
  const drivers = await tx.driver.findMany({
    where: { deletedAt: null },
    include: { assignedVehicle: { select: { expectedConsumptionL100km: true, immatriculation: true } } },
  });

  const [fuelLogs, trips] = await Promise.all([
    tx.fuelLog.findMany({ where: { loggedAt: { gte: since } } }),
    tx.trip.findMany({ where: { startedAt: { gte: since } } }),
  ]);

  return drivers.map(driver => {
    const driverTrips = trips.filter(trip => trip.driverId === driver.id);
    const distanceKm = driverTrips.reduce((sum, trip) => sum + toNumber(trip.distanceKm), 0);

    const driverFuel = fuelLogs.filter(log => log.driverId === driver.id);
    const litersUsed = driverFuel.reduce((sum, log) => sum + toNumber(log.litersAdded), 0);

    // La consommation n'a de sens qu'avec les deux mesures : des litres sans
    // distance, ou l'inverse, ne prouvent rien.
    const actualL100km = distanceKm > 0 && litersUsed > 0 ? (litersUsed / distanceKm) * 100 : undefined;

    return {
      driverId: driver.id,
      driverName: driver.fullName,
      safetyScore: toNumber(driver.currentSafetyScore),
      // La tendance suppose un historique de scores ; tant qu'il n'est pas
      // constitué, mieux vaut zéro qu'une variation inventée.
      scoreTrend30d: 0,
      actualL100km,
      expectedL100km: driver.assignedVehicle
        ? toNumber(driver.assignedVehicle.expectedConsumptionL100km)
        : undefined,
      distanceKm,
    };
  });
}

export async function listRewardProfiles(
  organizationId: string,
  rules: BonusRules = DEFAULT_BONUS_RULES,
): Promise<RewardProfile[]> {
  if (!isDatabaseEnabled()) return [];

  return withTenant(organizationId, async tx => {
    const since = new Date(Date.now() - PERIOD_DAYS * 86_400_000);

    const [organization, drivers, existing] = await Promise.all([
      tx.organization.findFirst({ where: { id: organizationId } }),
      tx.driver.findMany({
        where: { deletedAt: null },
        include: { assignedVehicle: { select: { immatriculation: true, make: true, model: true } } },
      }),
      tx.driverRewardProfile.findMany(),
    ]);

    const unlocked = await tx.driverUnlockedBadge.findMany({
      where: { driverId: { in: drivers.map(driver => driver.id) } },
      include: { badge: { select: { code: true, title: true } } },
    });

    const currency = organization?.currency ?? 'XOF';
    const vehicleOf = new Map(
      drivers.map(driver => [
        driver.id,
        driver.assignedVehicle
          ? `${driver.assignedVehicle.make} ${driver.assignedVehicle.model} (${driver.assignedVehicle.immatriculation})`
          : 'Aucun véhicule affecté',
      ]),
    );
    // Le versement déjà décidé n'est jamais recalculé.
    const payoutOf = new Map(existing.map(profile => [profile.driverId, profile]));

    const leaderboard = buildLeaderboard(await collectUsage(tx, since), rules);

    for (const reward of leaderboard) {
      await tx.driverRewardProfile.upsert({
        where: { driverId: reward.driverId },
        // Seul le constat est mis à jour : `payoutStatus`, `payoutMethod` et
        // `lastPayoutAt` en sont volontairement absents.
        update: {
          ecoScore: reward.ecoScore,
          scoreTrend30d: reward.scoreTrend30d,
          fuelEfficiencySavingsL100km: reward.fuelEfficiencySavingsL100km,
          estimatedFuelSavedLiters: reward.estimatedFuelSavedLiters,
          bonusEarned: reward.bonusEarned,
          totalPoints: reward.totalPoints,
          rankInCompany: reward.rankInCompany,
        },
        create: {
          organizationId,
          driverId: reward.driverId,
          ecoScore: reward.ecoScore,
          scoreTrend30d: reward.scoreTrend30d,
          fuelEfficiencySavingsL100km: reward.fuelEfficiencySavingsL100km,
          estimatedFuelSavedLiters: reward.estimatedFuelSavedLiters,
          bonusEarned: reward.bonusEarned,
          currency,
          totalPoints: reward.totalPoints,
          rankInCompany: reward.rankInCompany,
        },
      });
    }

    return leaderboard.map(reward => {
      const stored = payoutOf.get(reward.driverId);
      return {
        driverId: reward.driverId,
        driverName: reward.driverName,
        assignedVehicle: vehicleOf.get(reward.driverId) ?? 'Aucun véhicule affecté',
        currentSafetyScore: reward.safetyScore,
        scoreTrend30d: reward.scoreTrend30d,
        ecoScore: reward.ecoScore,
        fuelEfficiencySavingsL100km: reward.fuelEfficiencySavingsL100km,
        estimatedFuelSavedLiters: reward.estimatedFuelSavedLiters,
        bonusEarned: reward.bonusEarned,
        currency,
        eligible: reward.eligible,
        ineligibilityReason: reward.ineligibilityReason,
        payoutStatus: reward.eligible ? (stored?.payoutStatus ?? 'ELIGIBLE') : 'NOT_ELIGIBLE',
        payoutMethod: stored?.payoutMethod ?? 'FUEL_VOUCHER',
        lastPayoutAt: stored?.lastPayoutAt?.toISOString(),
        totalPoints: reward.totalPoints,
        rankInCompany: reward.rankInCompany,
        unlockedBadges: unlocked
          .filter(entry => entry.driverId === reward.driverId)
          .map(entry => ({
            badgeId: entry.badgeId,
            code: entry.badge.code,
            title: entry.badge.title,
            unlockedAt: entry.unlockedAt.toISOString(),
          })),
      };
    });
  });
}

export class DriverNotFound extends Error {}
export class BadgeNotFound extends Error {}

/**
 * Décision de versement.
 *
 * Elle engage la trésorerie de l'entreprise et la parole donnée au chauffeur :
 * marquer une prime « versée » dans le seul navigateur, pour l'oublier au
 * rechargement, laisserait croire à un paiement qui n'a pas eu lieu.
 */
export async function updatePayout(
  organizationId: string,
  driverId: string,
  input: { payoutStatus: $Enums.PayoutStatus; payoutMethod?: $Enums.PayoutMethod },
): Promise<void> {
  await withTenant(organizationId, async tx => {
    const { count } = await tx.driverRewardProfile.updateMany({
      where: { driverId },
      data: {
        payoutStatus: input.payoutStatus,
        ...(input.payoutMethod ? { payoutMethod: input.payoutMethod } : {}),
        // L'horodatage du versement vient du serveur : une date fournie par
        // l'appelant n'aurait aucune valeur probante en cas de litige.
        ...(input.payoutStatus === 'PAID' ? { lastPayoutAt: new Date() } : {}),
      },
    });

    if (count === 0) throw new DriverNotFound();
  });
}

/** Attribution d'une distinction, tracée et non rejouable. */
export async function grantBadge(
  organizationId: string,
  driverId: string,
  badgeCode: string,
  grantedBy: string,
): Promise<void> {
  await withTenant(organizationId, async tx => {
    // Le chauffeur est vérifié dans le contexte du tenant : sans cette lecture,
    // on pourrait décorer le chauffeur d'une autre organisation.
    const driver = await tx.driver.findFirst({ where: { id: driverId, deletedAt: null } });
    if (!driver) throw new DriverNotFound();

    const badge = await tx.digitalBadge.findFirst({ where: { code: badgeCode } });
    if (!badge) throw new BadgeNotFound();

    // La période fait partie de la clé : une même distinction peut se mériter
    // à nouveau le mois suivant, mais pas deux fois pour la même période.
    const periodLabel = new Date().toISOString().slice(0, 7);

    await tx.driverUnlockedBadge.upsert({
      where: { driverId_badgeId_periodLabel: { driverId, badgeId: badge.id, periodLabel } },
      update: {},
      create: { driverId, badgeId: badge.id, periodLabel, grantedBy },
    });
  });
}

/** Catalogue des distinctions. Il est commun à toutes les organisations. */
export async function listBadges(organizationId: string) {
  if (!isDatabaseEnabled()) return [];

  return withTenant(organizationId, async tx => {
    const badges = await tx.digitalBadge.findMany({ orderBy: { code: 'asc' } });

    return badges.map(badge => ({
      id: badge.id,
      code: badge.code,
      title: badge.title,
      description: badge.description,
      category: badge.category,
      rarity: badge.rarity,
      iconName: badge.iconName,
      expBonusPoints: badge.expBonusPoints,
      fuelBonusMultiplier: toNumber(badge.fuelBonusMultiplier),
      criterion: badge.criterion,
    }));
  });
}
