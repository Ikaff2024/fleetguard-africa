import { DriverScoreConfig } from '../types';

export interface ScoreCalculationInput {
  distanceDrivenKm: number;
  overspeedEventsCount: number;
  harshBrakingEventsCount: number;
  rapidAccelEventsCount: number;
  nightHoursDriven: number;
  geofenceBreachesCount: number;
}

export interface PenaltyExplanation {
  category: string;
  pointsLost: number;
  reason: string;
}

export interface SafetyScoreResult {
  score: number; // 0 to 100
  distanceDrivenKm: number;
  normalizedDistanceFactor: number;
  totalPenalties: number;
  breakdown: {
    overspeedPenalty: number;
    harshBrakingPenalty: number;
    rapidAccelPenalty: number;
    fatigueNightPenalty: number;
    geofenceBreachPenalty: number;
  };
  explanations: PenaltyExplanation[];
}

/**
 * Calculateur explicable du Driver Safety Score sur 100.
 * Basé sur une configuration versionnée et normalisé par la distance parcourue (par tranches de 100 km).
 */
export function calculateDriverSafetyScore(
  input: ScoreCalculationInput,
  config: DriverScoreConfig
): SafetyScoreResult {
  const {
    distanceDrivenKm,
    overspeedEventsCount,
    harshBrakingEventsCount,
    rapidAccelEventsCount,
    nightHoursDriven,
    geofenceBreachesCount,
  } = input;

  // Si aucune distance parcourue, pas d'infraction imputable
  const normDist = config.normalizationDistanceKm || 100;
  const distanceFactor = Math.max(0.2, distanceDrivenKm / normDist); // Minimum factor of 0.2 to avoid divide-by-zero or excessive penalty on 1 km

  const { overspeedWeight, harshBrakingWeight, rapidAccelWeight, fatigueNightWeight, geofenceBreachWeight } = config.weights;

  // Taux d'incidents par 100 km
  const overspeedRate = overspeedEventsCount / distanceFactor;
  const harshBrakingRate = harshBrakingEventsCount / distanceFactor;
  const rapidAccelRate = rapidAccelEventsCount / distanceFactor;
  const nightHoursRate = nightHoursDriven / distanceFactor;
  const geofenceBreachRate = geofenceBreachesCount / distanceFactor;

  // Calcul des pénalités brutes selon les poids de la configuration
  // Ex: Poids Overspeed = 35% -> 1 incident d'excès de vitesse par 100km déduit ~5 points
  const overspeedPenalty = Math.min(35, Math.round(overspeedRate * 7 * (overspeedWeight / 35) * 10) / 10);
  const harshBrakingPenalty = Math.min(25, Math.round(harshBrakingRate * 6 * (harshBrakingWeight / 25) * 10) / 10);
  const rapidAccelPenalty = Math.min(15, Math.round(rapidAccelRate * 4 * (rapidAccelWeight / 15) * 10) / 10);
  const fatigueNightPenalty = Math.min(15, Math.round(nightHoursRate * 5 * (fatigueNightWeight / 15) * 10) / 10);
  const geofenceBreachPenalty = Math.min(10, Math.round(geofenceBreachRate * 10 * (geofenceBreachWeight / 10) * 10) / 10);

  const totalPenalties = Math.round((overspeedPenalty + harshBrakingPenalty + rapidAccelPenalty + fatigueNightPenalty + geofenceBreachPenalty) * 10) / 10;
  const finalScore = Math.max(0, Math.min(100, Math.round((100 - totalPenalties) * 10) / 10));

  // Génération des explications lisibles pour l'utilisateur/gestionnaire
  const explanations: PenaltyExplanation[] = [];

  if (overspeedPenalty > 0) {
    explanations.push({
      category: 'Excès de Vitesse',
      pointsLost: overspeedPenalty,
      reason: `${overspeedEventsCount} détection(s) d'excès de vitesse sur ${Math.round(distanceDrivenKm)} km (${overspeedRate.toFixed(1)} incidents/100km).`,
    });
  }

  if (harshBrakingPenalty > 0) {
    explanations.push({
      category: 'Freinage Brusque',
      pointsLost: harshBrakingPenalty,
      reason: `${harshBrakingEventsCount} freinage(s) d'urgence (> 0.4g) mesuré(s) sur le trajet (${harshBrakingRate.toFixed(1)} incidents/100km).`,
    });
  }

  if (rapidAccelPenalty > 0) {
    explanations.push({
      category: 'Accélération Brutale',
      pointsLost: rapidAccelPenalty,
      reason: `${rapidAccelEventsCount} accélération(s) brusque(s) provoquant une surconsommation de carburant.`,
    });
  }

  if (fatigueNightPenalty > 0) {
    explanations.push({
      category: 'Conduite Nocturne (Fatigue)',
      pointsLost: fatigueNightPenalty,
      reason: `${nightHoursDriven} heure(s) de conduite effectuées sur le créneau à risque (00:00 - 05:00).`,
    });
  }

  if (geofenceBreachPenalty > 0) {
    explanations.push({
      category: 'Franchissement Zone Interdite',
      pointsLost: geofenceBreachPenalty,
      reason: `${geofenceBreachesCount} entrée(s) ou sortie(s) non autorisées dans un périmètre restreint.`,
    });
  }

  if (explanations.length === 0) {
    explanations.push({
      category: 'Conduite Exemplaire',
      pointsLost: 0,
      reason: 'Aucune infraction ni comportement à risque détecté sur cette période.',
    });
  }

  return {
    score: finalScore,
    distanceDrivenKm,
    normalizedDistanceFactor: Math.round(distanceFactor * 100) / 100,
    totalPenalties,
    breakdown: {
      overspeedPenalty,
      harshBrakingPenalty,
      rapidAccelPenalty,
      fatigueNightPenalty,
      geofenceBreachPenalty,
    },
    explanations,
  };
}

/**
 * Calculateur du Vehicle Health Score sur 100
 */
export function calculateVehicleHealthScore(
  odometerKm: number,
  lastServiceKm: number,
  nextServiceKmDue: number,
  activeMaintenanceLogsCount: number
): number {
  let score = 100;

  // Retard de maintenance
  if (odometerKm > nextServiceKmDue) {
    const overdueKm = odometerKm - nextServiceKmDue;
    const penalty = Math.min(40, Math.round((overdueKm / 1000) * 5));
    score -= penalty;
  }

  // Interventions correctives en cours
  score -= activeMaintenanceLogsCount * 15;

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculateur du Fuel Efficiency Score sur 100
 */
export function calculateFuelEfficiencyScore(
  expectedL100km: number,
  actualL100km: number
): { score: number; status: 'EXCELLENT' | 'NORMAL' | 'POOR' | 'SUSPECTED_THEFT' } {
  if (!actualL100km || actualL100km <= 0) return { score: 100, status: 'NORMAL' };

  const variancePct = ((actualL100km - expectedL100km) / expectedL100km) * 100;

  if (variancePct > 35) {
    return { score: 40, status: 'SUSPECTED_THEFT' };
  } else if (variancePct > 20) {
    return { score: 65, status: 'POOR' };
  } else if (variancePct > 5) {
    return { score: 85, status: 'NORMAL' };
  } else {
    return { score: 100, status: 'EXCELLENT' };
  }
}
