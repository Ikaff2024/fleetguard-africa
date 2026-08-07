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

/**
 * Un plein, tel qu'il est relevé sur le terrain.
 *
 * Le compteur au moment du plein est la donnée décisive : c'est lui qui borne
 * la distance réellement couverte par les litres versés.
 */
export interface FuelFill {
  loggedAt: Date;
  odometerKm: number;
  litersAdded: number;
}

export interface MeasuredConsumption {
  /** Consommation constatée, en L/100 km. Absente si non mesurable. */
  actualL100km?: number;
  measuredDistanceKm: number;
  measuredLiters: number;
  fillCount: number;
  /** Pourquoi la mesure est impossible, quand elle l'est. */
  reason?: string;
}

/** En deçà, l'écart de remplissage du réservoir domine la mesure. */
const MIN_MEASURED_DISTANCE_KM = 200;

/** Bornes de plausibilité pour un poids lourd ou un utilitaire. */
const MIN_PLAUSIBLE_L100KM = 5;
const MAX_PLAUSIBLE_L100KM = 120;

/**
 * Consommation mesurée d'un plein à l'autre.
 *
 * C'est la méthode des transporteurs, et la seule défendable. Diviser le
 * carburant enregistré par la distance totale parcourue paraît naturel et
 * donne un résultat faux : la distance est exhaustive — elle vient des trajets
 * reconstruits — alors que les pleins ne le sont pas. Un chauffeur qui roule
 * mille kilomètres et ne fait qu'un seul plein apparaît alors deux fois plus
 * sobre qu'il ne l'est, et l'entreprise lui verse une prime sur cet écart.
 *
 * Le premier plein ne compte pas dans les litres : le carburant déjà présent
 * dans le réservoir à ce moment-là n'a jamais été mesuré. Seule la distance
 * qu'il borne est retenue.
 */
export function measureConsumption(fills: FuelFill[]): MeasuredConsumption {
  const ordered = [...fills].sort((a, b) => a.odometerKm - b.odometerKm);

  if (ordered.length < 2) {
    return {
      measuredDistanceKm: 0,
      measuredLiters: 0,
      fillCount: ordered.length,
      reason: 'Au moins deux pleins sont nécessaires : la consommation se mesure d’un plein au suivant.',
    };
  }

  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  const measuredDistanceKm = last.odometerKm - first.odometerKm;

  // Les litres du premier plein sont exclus : ils ont servi avant la mesure.
  const measuredLiters = ordered.slice(1).reduce((sum, fill) => sum + fill.litersAdded, 0);

  if (measuredDistanceKm < MIN_MEASURED_DISTANCE_KM) {
    return {
      measuredDistanceKm,
      measuredLiters,
      fillCount: ordered.length,
      reason: `Seulement ${Math.round(measuredDistanceKm)} km entre le premier et le dernier plein : trop court pour une mesure fiable.`,
    };
  }

  const actualL100km = (measuredLiters / measuredDistanceKm) * 100;

  if (actualL100km < MIN_PLAUSIBLE_L100KM || actualL100km > MAX_PLAUSIBLE_L100KM) {
    // Un relevé de compteur erroné ou un plein oublié, pas un exploit.
    return {
      measuredDistanceKm,
      measuredLiters,
      fillCount: ordered.length,
      reason: `Consommation calculée de ${actualL100km.toFixed(1)} L/100 km, hors de toute plausibilité : vérifier les relevés de compteur et les pleins manquants.`,
    };
  }

  return {
    actualL100km: Math.round(actualL100km * 10) / 10,
    measuredDistanceKm: Math.round(measuredDistanceKm),
    measuredLiters: Math.round(measuredLiters),
    fillCount: ordered.length,
  };
}

export interface DriverFuelUsage {
  driverId: string;
  driverName: string;
  safetyScore: number;
  scoreTrend30d: number;
  /** Consommation constatée entre pleins, L/100 km. */
  actualL100km?: number;
  /** Consommation de référence du véhicule affecté, L/100 km. */
  expectedL100km?: number;
  /**
   * Distance couverte par la mesure, en kilomètres.
   *
   * C'est celle bornée par les pleins, pas la distance totale parcourue :
   * l'économie ne peut être créditée que sur ce qui a été mesuré.
   */
  distanceKm: number;
  /** Motif d'impossibilité de mesure, le cas échéant. */
  measurementIssue?: string;
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
    ineligibilityReason =
      usage.measurementIssue ?? 'Aucun plein enregistré sur la période : économie non mesurable.';
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
