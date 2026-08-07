import { type FatigueMetrics, type LegalFramework } from './fatigue-builder.js';

/**
 * Faisabilité d'une mission planifiée.
 *
 * C'est la seule partie de l'application qui porte sur l'avenir, et la seule
 * qui puisse empêcher quelque chose. Sa valeur ne tient pas au calendrier — un
 * tableur en fait autant — mais au refus : une mission qui ferait dépasser les
 * plafonds de conduite est bloquée, sur des heures **mesurées** à partir des
 * trajets reconstruits et non sur un carnet rempli de mémoire en fin de
 * semaine.
 *
 * Le dépassement reste possible : un relais imprévu, une frontière qui ferme,
 * et le plafond cède devant la réalité. Mais jamais en silence. Le gestionnaire
 * qui passe outre doit le motiver, et la justification est conservée — en cas
 * d'accident, la question posée à l'entreprise sera exactement celle-là.
 */

export interface PlannedMission {
  driverId: string;
  vehicleId: string;
  scheduledStart: Date;
  plannedDistanceKm: number;
}

export interface ExistingAssignment {
  id: string;
  driverId: string;
  vehicleId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
}

export type BlockerCode = 'DAILY_LIMIT' | 'WEEKLY_LIMIT' | 'REST_REQUIRED' | 'DRIVER_BUSY' | 'VEHICLE_BUSY';

export interface Feasibility {
  feasible: boolean;
  plannedDrivingHours: number;
  scheduledEnd: Date;
  /** Vitesse retenue pour l'estimation, et d'où elle vient. */
  assumedSpeedKmH: number;
  speedBasis: 'OBSERVED' | 'DEFAULT';
  blockers: { code: BlockerCode; message: string }[];
  warnings: string[];
}

/**
 * Vitesse retenue faute de mieux.
 *
 * Corridor ouest-africain avec postes de contrôle, pistes dégradées et
 * traversées d'agglomérations : la moyenne porte-à-porte reste bien inférieure
 * à la vitesse de croisière. Elle n'est utilisée que tant que l'organisation
 * n'a pas assez de trajets pour fournir la sienne.
 */
export const DEFAULT_CORRIDOR_SPEED_KMH = 45;

/** En dessous, la moyenne observée ne serait pas représentative. */
const MIN_TRIPS_FOR_OBSERVED_SPEED = 3;

export interface ObservedPace {
  tripCount: number;
  totalDistanceKm: number;
  totalDrivingHours: number;
}

/**
 * Vitesse porte-à-porte de l'organisation, déduite de ses propres trajets.
 *
 * Planifier sur la vitesse observée du client plutôt que sur une constante
 * change tout : un transporteur qui roule sur bitume et un autre qui dessert
 * des pistes n'ont pas les mêmes durées, et une estimation fausse fait rater
 * des rendez-vous de chargement.
 */
export function paceOf(pace: ObservedPace): { speedKmH: number; basis: 'OBSERVED' | 'DEFAULT' } {
  if (pace.tripCount < MIN_TRIPS_FOR_OBSERVED_SPEED || pace.totalDrivingHours <= 0) {
    return { speedKmH: DEFAULT_CORRIDOR_SPEED_KMH, basis: 'DEFAULT' };
  }

  const observed = pace.totalDistanceKm / pace.totalDrivingHours;
  // Garde-fou : une moyenne aberrante viendrait de données incomplètes, pas
  // d'un exploit de conduite.
  if (observed < 15 || observed > 110) {
    return { speedKmH: DEFAULT_CORRIDOR_SPEED_KMH, basis: 'DEFAULT' };
  }

  return { speedKmH: Math.round(observed), basis: 'OBSERVED' };
}

function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start < b.end && b.start < a.end;
}

export function assessMission(
  mission: PlannedMission,
  fatigue: FatigueMetrics,
  framework: LegalFramework,
  existing: ExistingAssignment[],
  pace: ObservedPace,
): Feasibility {
  const { speedKmH, basis } = paceOf(pace);

  const plannedDrivingHours = Math.round((mission.plannedDistanceKm / speedKmH) * 10) / 10;

  /**
   * Les pauses obligatoires allongent la mission sans être de la conduite.
   *
   * Les ignorer donnerait une heure d'arrivée intenable, et c'est ainsi qu'on
   * pousse un chauffeur à rouler sans s'arrêter pour « rattraper ».
   */
  const mandatoryBreaks = Math.floor(plannedDrivingHours / framework.mandatoryBreakAfterHours);
  const breakHours = (mandatoryBreaks * framework.mandatoryBreakDurationMinutes) / 60;

  const scheduledEnd = new Date(
    mission.scheduledStart.getTime() + (plannedDrivingHours + breakHours) * 3_600_000,
  );

  const blockers: Feasibility['blockers'] = [];
  const warnings: string[] = [];

  // --- Plafonds de conduite, sur les heures déjà mesurées ---
  const dayOfMission = mission.scheduledStart.toDateString() === new Date().toDateString();
  const alreadyToday = dayOfMission ? fatigue.hoursDrivenToday : 0;

  if (alreadyToday + plannedDrivingHours > framework.maxDailyDrivingHours) {
    blockers.push({
      code: 'DAILY_LIMIT',
      message: `${alreadyToday} h déjà conduites aujourd’hui et ${plannedDrivingHours} h prévues : le plafond journalier de ${framework.maxDailyDrivingHours} h serait dépassé.`,
    });
  }

  if (fatigue.hoursDrivenThisWeek + plannedDrivingHours > framework.maxWeeklyDrivingHours) {
    blockers.push({
      code: 'WEEKLY_LIMIT',
      message: `${fatigue.hoursDrivenThisWeek} h conduites sur sept jours et ${plannedDrivingHours} h prévues : le plafond hebdomadaire de ${framework.maxWeeklyDrivingHours} h serait dépassé.`,
    });
  }

  if (fatigue.isMandatoryRestEnforced) {
    blockers.push({
      code: 'REST_REQUIRED',
      message: `Ce chauffeur est en repos réglementaire : ${fatigue.primaryRecommendation}`,
    });
  }

  // --- Conflits d'affectation ---
  const window = { start: mission.scheduledStart, end: scheduledEnd };

  for (const assignment of existing) {
    const other = { start: assignment.scheduledStart, end: assignment.scheduledEnd };
    if (!overlaps(window, other)) continue;

    if (assignment.driverId === mission.driverId) {
      blockers.push({
        code: 'DRIVER_BUSY',
        message: 'Ce chauffeur est déjà affecté à une mission sur ce créneau.',
      });
    }
    if (assignment.vehicleId === mission.vehicleId) {
      blockers.push({
        code: 'VEHICLE_BUSY',
        message: 'Ce véhicule est déjà engagé sur une mission à ce moment-là.',
      });
    }
  }

  // --- Avertissements : ils n'empêchent pas, ils informent ---
  const remainingWeek = framework.maxWeeklyDrivingHours - fatigue.hoursDrivenThisWeek;
  if (blockers.length === 0 && remainingWeek - plannedDrivingHours < 5) {
    warnings.push(
      `Après cette mission, il ne restera que ${Math.max(0, Math.round((remainingWeek - plannedDrivingHours) * 10) / 10)} h avant le plafond hebdomadaire.`,
    );
  }

  if (fatigue.consecutiveDaysWorked >= 5) {
    warnings.push(
      `${fatigue.consecutiveDaysWorked} jours consécutifs déjà travaillés : prévoir un repos hebdomadaire.`,
    );
  }

  // Une mission dépassant nettement le plafond journalier suppose un relais.
  if (plannedDrivingHours > framework.maxDailyDrivingHours) {
    warnings.push(
      `Cette mission demande ${plannedDrivingHours} h de conduite, au-delà des ${framework.maxDailyDrivingHours} h d’une journée : prévoir un relais ou une étape.`,
    );
  }

  if (basis === 'DEFAULT') {
    warnings.push(
      `Durée estimée sur une moyenne de ${speedKmH} km/h faute de trajets suffisants : elle s’affinera avec l’historique de votre flotte.`,
    );
  }

  return {
    feasible: blockers.length === 0,
    plannedDrivingHours,
    scheduledEnd,
    assumedSpeedKmH: speedKmH,
    speedBasis: basis,
    blockers,
    warnings,
  };
}
