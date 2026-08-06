/**
 * Calcul des primes de conduite économe.
 *
 * Le principe est un partage de gain : le carburant qu'un chauffeur économise
 * par rapport à la consommation de référence de son véhicule est valorisé, et
 * une part lui revient. C'est ce qui rend la sécurité routière défendable
 * auprès d'un transporteur — elle cesse d'être un coût pour devenir une source
 * d'économie mesurable.
 *
 * Trois précautions gouvernent ce module.
 *
 * **Rien n'est estimé.** L'économie se mesure sur les pleins réellement
 * enregistrés, comparés à la consommation de référence du véhicule. Sans plein
 * relevé, il n'y a pas d'économie à verser : un chauffeur ne doit pas toucher
 * de prime sur un chiffre inventé, et l'entreprise ne doit pas payer pour un
 * gain qu'elle n'a pas réalisé.
 *
 * **Un seuil de sécurité conditionne tout.** Économiser du gazole en roulant
 * vite ne mérite aucune récompense ; le score de sécurité commande.
 *
 * **La prime est plafonnée.** Un plafond mensuel protège l'entreprise d'une
 * dérive due à une donnée aberrante — un relevé de compteur erroné suffirait à
 * produire une économie fantaisiste.
 */

export interface BonusRules {
  /** Prix du litre servant à valoriser l'économie. */
  fuelPricePerLiter: number;
  /** Part de l'économie reversée au chauffeur, en pourcentage. */
  sharedSavingsPercentage: number;
  /** Score de sécurité minimal pour ouvrir droit à la prime. */
  minSafetyScoreForBonus: number;
  /** Plafond mensuel, en devise de l'organisation. */
  maxMonthlyBonusCap: number;
  /** Prime de base accordée dès le seuil atteint. */
  baseTierBonus: number;
  bonusPayoutCycle: 'WEEKLY' | 'MONTHLY';
}

export const DEFAULT_BONUS_RULES: BonusRules = {
  // Ordre de grandeur du gazole à la pompe en zone UEMOA.
  fuelPricePerLiter: 750,
  // Moitié-moitié : assez pour motiver, assez pour que l'entreprise y gagne.
  sharedSavingsPercentage: 50,
  minSafetyScoreForBonus: 85,
  maxMonthlyBonusCap: 150_000,
  baseTierBonus: 15_000,
  bonusPayoutCycle: 'MONTHLY',
};

export interface DriverFuelUsage {
  driverId: string;
  driverName: string;
  safetyScore: number;
  scoreTrend30d: number;
  /** Consommation constatée sur la période, L/100 km. */
  actualL100km?: number;
  /** Consommation de référence du véhicule affecté, L/100 km. */
  expectedL100km?: number;
  /** Distance parcourue sur la période, en kilomètres. */
  distanceKm: number;
}

export interface ComputedReward {
  driverId: string;
  driverName: string;
  safetyScore: number;
  scoreTrend30d: number;
  ecoScore: number;
  /** Écart à la référence : négatif quand le chauffeur consomme moins. */
  fuelEfficiencySavingsL100km: number;
  estimatedFuelSavedLiters: number;
  bonusEarned: number;
  eligible: boolean;
  /** Pourquoi la prime est nulle, quand elle l'est. */
  ineligibilityReason?: string;
  totalPoints: number;
}

/**
 * Score écologique.
 *
 * Il combine la sécurité et la sobriété plutôt que la seule consommation : un
 * chauffeur qui économise en roulant trop vite ne doit pas être présenté en
 * tête du classement.
 */
function ecoScoreOf(safetyScore: number, savingsRatio: number): number {
  const sobriety = Math.max(0, Math.min(1, savingsRatio / 0.15)) * 100;
  return Math.round(safetyScore * 0.6 + sobriety * 0.4);
}

export function computeReward(usage: DriverFuelUsage, rules: BonusRules): ComputedReward {
  const { actualL100km, expectedL100km } = usage;

  const measurable =
    actualL100km !== undefined && expectedL100km !== undefined && expectedL100km > 0 && usage.distanceKm > 0;

  // Négatif quand le chauffeur consomme moins que la référence.
  const deltaL100km = measurable ? actualL100km - expectedL100km : 0;
  const savingsRatio = measurable ? Math.max(0, -deltaL100km / expectedL100km) : 0;

  // Litres épargnés sur la distance réellement parcourue.
  const litersSaved = measurable ? Math.max(0, (-deltaL100km * usage.distanceKm) / 100) : 0;

  const ecoScore = ecoScoreOf(usage.safetyScore, savingsRatio);

  let bonusEarned = 0;
  let ineligibilityReason: string | undefined;

  if (usage.safetyScore < rules.minSafetyScoreForBonus) {
    ineligibilityReason = `Score de sécurité de ${Math.round(usage.safetyScore)}/100, en dessous du seuil de ${rules.minSafetyScoreForBonus}.`;
  } else if (!measurable) {
    // Le dire plutôt que de verser sur une estimation : la prime doit
    // s'expliquer devant le chauffeur comme devant le comptable.
    ineligibilityReason = 'Aucun plein enregistré sur la période : économie non mesurable.';
  } else if (litersSaved <= 0) {
    ineligibilityReason = 'Consommation au-dessus de la référence du véhicule.';
  } else {
    const value = litersSaved * rules.fuelPricePerLiter * (rules.sharedSavingsPercentage / 100);
    bonusEarned = Math.min(rules.maxMonthlyBonusCap, Math.round(rules.baseTierBonus + value));
  }

  return {
    driverId: usage.driverId,
    driverName: usage.driverName,
    safetyScore: usage.safetyScore,
    scoreTrend30d: usage.scoreTrend30d,
    ecoScore,
    fuelEfficiencySavingsL100km: Math.round(deltaL100km * 10) / 10,
    estimatedFuelSavedLiters: Math.round(litersSaved),
    bonusEarned,
    eligible: bonusEarned > 0,
    ineligibilityReason,
    // Les points de gamification suivent le score écologique et la distance :
    // un chauffeur qui roule peu ne domine pas le classement sans effort.
    totalPoints: Math.round(ecoScore * 10 + usage.distanceKm / 10),
  };
}

/** Classe les chauffeurs et leur attribue un rang. */
export function buildLeaderboard(
  usages: DriverFuelUsage[],
  rules: BonusRules = DEFAULT_BONUS_RULES,
): (ComputedReward & { rankInCompany: number })[] {
  return computeAll(usages, rules)
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((reward, index) => ({ ...reward, rankInCompany: index + 1 }));
}

export function computeAll(usages: DriverFuelUsage[], rules: BonusRules): ComputedReward[] {
  return usages.map(usage => computeReward(usage, rules));
}
