import type { $Enums } from '../../generated/prisma/client.js';
import { isDatabaseEnabled, withTenant } from '../db/prisma.js';
import {
  type BonusRules,
  DEFAULT_BONUS_RULES,
  observedFuelPrice,
  type DriverFuelUsage,
  buildLeaderboard,
  measureConsumption,
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
  /** Bornes de la période récompensée — le montant et le statut s'y rapportent. */
  periodStart: string;
  periodEnd: string;
  /** Montant du versement enregistré pour cette période, s'il a eu lieu. */
  paidAmount?: number;
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

  const fuelLogs = await tx.fuelLog.findMany({ where: { loggedAt: { gte: since } } });

  return drivers.map(driver => {
    /**
     * La consommation se mesure d'un plein à l'autre.
     *
     * La version précédente divisait le carburant enregistré par la distance
     * totale des trajets. La distance était exhaustive, les pleins ne l'étaient
     * pas : un chauffeur ayant parcouru 1 397 km avec un seul plein de 198 L
     * apparaissait à 14 L/100 km sur un semi-remorque de 40 tonnes, et
     * l'entreprise lui versait 131 962 XOF sur cet écart.
     */
    const fills = fuelLogs
      .filter(log => log.driverId === driver.id)
      .map(log => ({
        loggedAt: log.loggedAt,
        odometerKm: log.odometerKm,
        litersAdded: toNumber(log.litersAdded),
      }));

    const measured = measureConsumption(fills);

    return {
      driverId: driver.id,
      driverName: driver.fullName,
      safetyScore: toNumber(driver.currentSafetyScore),
      // La tendance suppose un historique de scores ; tant qu'il n'est pas
      // constitué, mieux vaut zéro qu'une variation inventée.
      scoreTrend30d: 0,
      actualL100km: measured.actualL100km,
      expectedL100km: driver.assignedVehicle
        ? toNumber(driver.assignedVehicle.expectedConsumptionL100km)
        : undefined,
      // Seule la distance bornée par les pleins ouvre droit à une économie.
      distanceKm: measured.measuredDistanceKm,
      measurementIssue: measured.reason,
    };
  });
}

/**
 * Règles de prime effectivement appliquées à une organisation.
 *
 * Le prix du litre est celui qu'elle paie réellement, relevé sur ses pleins.
 * Les autres paramètres restent ceux du produit tant qu'ils ne sont pas
 * configurables par entreprise.
 */
export async function effectiveBonusRules(
  organizationId: string,
): Promise<BonusRules & { fuelPriceBasis: 'OBSERVED' | 'DEFAULT' }> {
  if (!isDatabaseEnabled()) {
    return { ...DEFAULT_BONUS_RULES, fuelPriceBasis: 'DEFAULT' };
  }

  return withTenant(organizationId, async tx => {
    const since = new Date(Date.now() - PERIOD_DAYS * 86_400_000);
    const fills = await tx.fuelLog.findMany({
      where: { loggedAt: { gte: since } },
      select: { litersAdded: true, totalCost: true },
    });

    const { pricePerLiter, basis } = observedFuelPrice(
      fills.map(fill => ({ litersAdded: toNumber(fill.litersAdded), totalCost: toNumber(fill.totalCost) })),
    );

    return { ...DEFAULT_BONUS_RULES, fuelPricePerLiter: pricePerLiter, fuelPriceBasis: basis };
  });
}

export async function listRewardProfiles(
  organizationId: string,
  rules: BonusRules = DEFAULT_BONUS_RULES,
): Promise<RewardProfile[]> {
  if (!isDatabaseEnabled()) return [];

  return withTenant(organizationId, async tx => {
    const periodEnd = new Date();
    const since = new Date(periodEnd.getTime() - PERIOD_DAYS * 86_400_000);
    // Les bornes sont arrêtées au jour : sans cela, deux consultations à une
    // minute d'intervalle produiraient deux périodes différentes, et un
    // versement ne pourrait jamais être rattaché à celle qu'il paie.
    const periodStart = new Date(since);
    periodStart.setHours(0, 0, 0, 0);

    const [organization, drivers] = await Promise.all([
      tx.organization.findFirst({ where: { id: organizationId } }),
      tx.driver.findMany({
        where: { deletedAt: null },
        include: { assignedVehicle: { select: { immatriculation: true, make: true, model: true } } },
      }),
    ]);

    /**
     * Versements déjà décidés POUR CETTE PÉRIODE.
     *
     * C'est tout le correctif : le statut lu auparavant sur le profil datait
     * d'un versement antérieur et s'affichait à côté du montant du mois en
     * cours. Un chauffeur voyait « 42 000 XOF — VERSÉ le 5 juillet » alors que
     * ces 42 000 francs n'avaient jamais été payés, et le bouton d'approbation
     * avait disparu.
     */
    const payouts = await tx.rewardPayout.findMany({
      where: { periodStart, status: { not: 'CANCELLED' } },
    });
    const payoutForPeriod = new Map(payouts.map(payout => [payout.driverId, payout]));

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
        // Le statut décrit la période affichée, et elle seule.
        payoutStatus: !reward.eligible
          ? 'NOT_ELIGIBLE'
          : (payoutForPeriod.get(reward.driverId)?.status ?? 'ELIGIBLE'),
        payoutMethod: payoutForPeriod.get(reward.driverId)?.method ?? 'FUEL_VOUCHER',
        lastPayoutAt: payoutForPeriod.get(reward.driverId)?.paidAt?.toISOString(),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        /** Montant réellement enregistré comme versé, s'il existe. */
        paidAmount: payoutForPeriod.get(reward.driverId)
          ? toNumber(payoutForPeriod.get(reward.driverId)!.amount)
          : undefined,
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
/**
 * Moyens de versement réellement disponibles.
 *
 * Verser une prime en monnaie électronique relève de la réglementation BCEAO
 * et suppose un agrégateur agréé. Le schéma le dit depuis le premier jour —
 * et l'interface proposait pourtant « Verser via Mobile Money », qui inscrivait
 * la prime « versée » sans qu'un franc ne quitte l'entreprise.
 *
 * Un chauffeur qui réclame son dû se voit alors opposer un enregistrement de
 * paiement. Tant qu'aucun transfert n'est techniquement possible, l'API refuse
 * ces moyens plutôt que d'enregistrer une preuve de paiement sans paiement.
 */
export const AVAILABLE_PAYOUT_METHODS: $Enums.PayoutMethod[] = ['FUEL_VOUCHER'];

export class PayoutMethodUnavailable extends Error {
  constructor(readonly method: string) {
    super(
      `Le versement par ${method} suppose un agrégateur de monnaie électronique agréé, qui n'est pas raccordé. ` +
        'Seul le bon carburant peut être enregistré pour le moment.',
    );
  }
}

/**
 * Décision de versement, rattachée à la période qu'elle paie.
 *
 * `PAID` signifie « le versement a été effectué », pas « l'application l'a
 * effectué » : le transfert a lieu hors de l'outil, et c'est le gestionnaire
 * qui le constate ici. La distinction n'est pas rhétorique — c'est elle qui
 * rend l'enregistrement défendable devant un chauffeur qui conteste.
 */
export async function updatePayout(
  organizationId: string,
  driverId: string,
  input: { payoutStatus: $Enums.PayoutStatus; payoutMethod?: $Enums.PayoutMethod },
  actorUserId?: string,
): Promise<void> {
  if (input.payoutMethod && !AVAILABLE_PAYOUT_METHODS.includes(input.payoutMethod)) {
    throw new PayoutMethodUnavailable(input.payoutMethod);
  }

  await withTenant(organizationId, async tx => {
    const driver = await tx.driver.findFirst({ where: { id: driverId, deletedAt: null } });
    if (!driver) throw new DriverNotFound();

    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - PERIOD_DAYS * 86_400_000);
    periodStart.setHours(0, 0, 0, 0);

    const profile = await tx.driverRewardProfile.findFirst({ where: { driverId } });
    const organization = await tx.organization.findFirst({ where: { id: organizationId } });

    // Un retour en arrière efface la décision de la période plutôt que de
    // laisser une trace « versée » sur une prime qui ne l'est plus. Seuls
    // APPROVED et PAID constituent une décision ; le reste la retire.
    if (input.payoutStatus !== 'APPROVED' && input.payoutStatus !== 'PAID') {
      await tx.rewardPayout.updateMany({
        where: { driverId, periodStart },
        data: { status: 'CANCELLED' },
      });
      return;
    }

    await tx.rewardPayout.upsert({
      where: { driverId_periodStart: { driverId, periodStart } },
      create: {
        organizationId,
        driverId,
        periodStart,
        periodEnd,
        // Le montant est figé au moment de la décision : recalculé plus tard,
        // il ne correspondrait plus à ce qui a été approuvé.
        amount: profile?.bonusEarned ?? 0,
        currency: organization?.currency ?? 'XOF',
        method: input.payoutMethod ?? 'FUEL_VOUCHER',
        status: input.payoutStatus === 'PAID' ? 'PAID' : 'APPROVED',
        approvedByUserId: actorUserId ?? null,
        paidAt: input.payoutStatus === 'PAID' ? new Date() : null,
      },
      update: {
        method: input.payoutMethod ?? undefined,
        status: input.payoutStatus === 'PAID' ? 'PAID' : 'APPROVED',
        paidAt: input.payoutStatus === 'PAID' ? new Date() : null,
      },
    });
  });
}

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
