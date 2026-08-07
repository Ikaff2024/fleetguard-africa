/**
 * Mesure de la fatigue au volant.
 *
 * Rien n'est déclaré ici : tout se déduit des trajets reconstruits, donc des
 * positions réellement remontées du terrain. Un chauffeur ne saisit pas ses
 * heures, et il ne faut pas les lui demander — un carnet rempli de mémoire en
 * fin de semaine ne vaut rien, et le confronter à un chiffre qu'il conteste
 * ruinerait la confiance dans l'outil.
 *
 * Le cadre réglementaire, lui, est une référence documentée et non une donnée
 * inventée : les durées maximales viennent des textes régionaux.
 */

export type FatigueRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type BurnoutRiskCategory = 'MINIMAL' | 'MODERATE' | 'ELEVATED' | 'CRITICAL_BURNOUT';
export type LegalRegion = 'UEMOA_CEDEAO' | 'EAC_EAST_AFRICA' | 'SADC_SOUTHERN';

export interface LegalFramework {
  region: LegalRegion;
  name: string;
  maxDailyDrivingHours: number;
  maxWeeklyDrivingHours: number;
  maxBiWeeklyDrivingHours: number;
  mandatoryBreakAfterHours: number;
  mandatoryBreakDurationMinutes: number;
  minDailyRestHours: number;
  minWeeklyRestHours: number;
  maxNightHoursPerShift: number;
  description: string;
}

/**
 * Cadres régionaux applicables.
 *
 * Ce sont des références réglementaires, pas des paramètres à ajuster au gré
 * des besoins : les assouplir reviendrait à couvrir une infraction.
 */
export const LEGAL_FRAMEWORKS: LegalFramework[] = [
  {
    region: 'UEMOA_CEDEAO',
    name: 'UEMOA / CEDEAO — Afrique de l’Ouest',
    maxDailyDrivingHours: 9,
    maxWeeklyDrivingHours: 56,
    maxBiWeeklyDrivingHours: 90,
    mandatoryBreakAfterHours: 4.5,
    mandatoryBreakDurationMinutes: 45,
    minDailyRestHours: 11,
    minWeeklyRestHours: 45,
    maxNightHoursPerShift: 4,
    description:
      'Règlement communautaire sur le transport routier inter-États : 9 h de conduite par jour, pause de 45 min après 4 h 30.',
  },
  {
    region: 'EAC_EAST_AFRICA',
    name: 'EAC — Afrique de l’Est',
    maxDailyDrivingHours: 8,
    maxWeeklyDrivingHours: 48,
    maxBiWeeklyDrivingHours: 88,
    mandatoryBreakAfterHours: 4,
    mandatoryBreakDurationMinutes: 30,
    minDailyRestHours: 11,
    minWeeklyRestHours: 45,
    maxNightHoursPerShift: 4,
    description:
      'Corridor Nord et Central : plafond journalier plus strict, pause de 30 min après 4 h de conduite.',
  },
  {
    region: 'SADC_SOUTHERN',
    name: 'SADC — Afrique australe',
    maxDailyDrivingHours: 9,
    maxWeeklyDrivingHours: 55,
    maxBiWeeklyDrivingHours: 90,
    mandatoryBreakAfterHours: 5,
    mandatoryBreakDurationMinutes: 30,
    minDailyRestHours: 9,
    minWeeklyRestHours: 36,
    maxNightHoursPerShift: 5,
    description: 'Corridors d’Afrique australe : repos journalier réduit à 9 h sous conditions.',
  },
];

export const DEFAULT_FRAMEWORK = LEGAL_FRAMEWORKS[0]!;

/** Un trajet, tel que la reconstruction le produit. */
export interface TripWindow {
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  stopSeconds: number;
  distanceKm: number;
}

export interface FatigueMetrics {
  driverId: string;
  fatigueScore: number;
  fatigueLevel: FatigueRiskLevel;
  burnoutRisk: BurnoutRiskCategory;
  hoursDrivenToday: number;
  hoursDrivenThisWeek: number;
  nightHoursDrivenLast7Days: number;
  consecutiveDaysWorked: number;
  lastRestDurationHours: number;
  hoursSinceLastBreak: number;
  breakComplianceStatus: 'COMPLIANT' | 'WARNING' | 'BREACH';
  maxDailyHoursLimit: number;
  maxWeeklyHoursLimit: number;
  remainingDailyHours: number;
  remainingWeeklyHours: number;
  isMandatoryRestEnforced: boolean;
  recommendedNextShiftStart?: string;
  primaryRecommendation: string;
  /** Vrai quand aucun trajet n'a été reconstruit : rien n'est mesurable. */
  hasData: boolean;
  fatigueFactors: { factorName: string; impactScore: number; description: string }[];
}

const HOUR = 3_600_000;

/** Heures de conduite entre 22 h et 6 h, période où la vigilance s'effondre. */
function nightHoursOf(trip: TripWindow): number {
  let night = 0;

  // Découpage heure par heure : un trajet peut traverser plusieurs fois la
  // frontière jour/nuit, et l'approximer par l'heure de départ fausserait tout
  // sur un Cotonou-Niamey.
  for (let cursor = trip.startedAt.getTime(); cursor < trip.endedAt.getTime(); cursor += HOUR) {
    const slice = Math.min(HOUR, trip.endedAt.getTime() - cursor) / HOUR;
    const hour = new Date(cursor).getHours();
    if (hour >= 22 || hour < 6) night += slice;
  }

  return Math.round(night * 10) / 10;
}

/** Heures de conduite effective : le temps à l'arrêt n'est pas de la conduite. */
function drivingHoursOf(trip: TripWindow): number {
  return Math.max(0, trip.durationSeconds - trip.stopSeconds) / 3600;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export function computeFatigue(
  driverId: string,
  trips: TripWindow[],
  framework: LegalFramework = DEFAULT_FRAMEWORK,
  now: Date = new Date(),
): FatigueMetrics {
  const ordered = [...trips].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const latest = ordered[ordered.length - 1];

  const weekAgo = new Date(now.getTime() - 7 * 24 * HOUR);
  const thisWeek = ordered.filter(trip => trip.endedAt >= weekAgo);

  const hoursDrivenToday = round(
    ordered.filter(trip => sameDay(trip.startedAt, now)).reduce((sum, t) => sum + drivingHoursOf(t), 0),
  );
  const hoursDrivenThisWeek = round(thisWeek.reduce((sum, t) => sum + drivingHoursOf(t), 0));
  const nightHoursDrivenLast7Days = round(thisWeek.reduce((sum, t) => sum + nightHoursOf(t), 0));

  // Jours consécutifs travaillés : une journée sans aucun trajet rompt la série.
  let consecutiveDaysWorked = 0;
  for (let offset = 0; offset < 14; offset++) {
    const day = new Date(now.getTime() - offset * 24 * HOUR);
    const worked = ordered.some(trip => sameDay(trip.startedAt, day));
    if (!worked) {
      // Le jour même peut n'avoir pas encore commencé : il n'interrompt rien.
      if (offset === 0) continue;
      break;
    }
    consecutiveDaysWorked++;
  }

  const lastRestDurationHours = latest ? round((now.getTime() - latest.endedAt.getTime()) / HOUR) : 0;

  /**
   * Conduite continue en cours.
   *
   * Elle n'a de sens que si le chauffeur roule encore. Mesurer la « conduite
   * continue » sur un trajet terminé la veille conduisait à réclamer une pause
   * immédiate pour quelqu'un rentré chez lui depuis vingt heures — un écran qui
   * dit cela cesse d'être lu, et les vraies alertes se perdent avec.
   *
   * Le repos pris depuis la fin du dernier trajet vaut pause dès qu'il atteint
   * la durée réglementaire.
   */
  const restedSinceLastTrip =
    !latest || lastRestDurationHours >= framework.mandatoryBreakDurationMinutes / 60;

  const hoursSinceLastBreak = restedSinceLastTrip
    ? 0
    : round(
        latest.stopSeconds >= framework.mandatoryBreakDurationMinutes * 60
          ? drivingHoursOf(latest) / 2
          : drivingHoursOf(latest),
      );

  const remainingDailyHours = round(Math.max(0, framework.maxDailyDrivingHours - hoursDrivenToday));
  const remainingWeeklyHours = round(Math.max(0, framework.maxWeeklyDrivingHours - hoursDrivenThisWeek));

  const breakComplianceStatus: FatigueMetrics['breakComplianceStatus'] =
    hoursSinceLastBreak > framework.mandatoryBreakAfterHours
      ? 'BREACH'
      : hoursSinceLastBreak > framework.mandatoryBreakAfterHours * 0.8
        ? 'WARNING'
        : 'COMPLIANT';

  /**
   * Le score agrège quatre pressions, pondérées par leur poids sur la vigilance.
   *
   * Aucune n'est décisive à elle seule : c'est leur accumulation qui rend un
   * chauffeur dangereux, et c'est précisément ce qu'un planning ne montre pas.
   */
  const factors = [
    {
      factorName: 'Conduite du jour',
      impactScore: pct(hoursDrivenToday / framework.maxDailyDrivingHours),
      description: `${hoursDrivenToday} h conduites sur ${framework.maxDailyDrivingHours} h autorisées.`,
    },
    {
      factorName: 'Charge hebdomadaire',
      impactScore: pct(hoursDrivenThisWeek / framework.maxWeeklyDrivingHours),
      description: `${hoursDrivenThisWeek} h sur les sept derniers jours, plafond ${framework.maxWeeklyDrivingHours} h.`,
    },
    {
      factorName: 'Conduite de nuit',
      impactScore: pct(nightHoursDrivenLast7Days / (framework.maxNightHoursPerShift * 5)),
      description: `${nightHoursDrivenLast7Days} h entre 22 h et 6 h sur sept jours.`,
    },
    {
      factorName: 'Jours sans repos',
      impactScore: pct(consecutiveDaysWorked / 6),
      description: `${consecutiveDaysWorked} jour(s) consécutif(s) avec au moins un trajet.`,
    },
  ];

  const fatigueScore = Math.round(
    factors[0]!.impactScore * 0.35 +
      factors[1]!.impactScore * 0.3 +
      factors[2]!.impactScore * 0.2 +
      factors[3]!.impactScore * 0.15,
  );

  const fatigueLevel: FatigueRiskLevel =
    fatigueScore >= 80 ? 'CRITICAL' : fatigueScore >= 60 ? 'HIGH' : fatigueScore >= 35 ? 'MODERATE' : 'LOW';

  const burnoutRisk: BurnoutRiskCategory =
    consecutiveDaysWorked >= 7 || fatigueScore >= 85
      ? 'CRITICAL_BURNOUT'
      : consecutiveDaysWorked >= 6 || fatigueScore >= 65
        ? 'ELEVATED'
        : fatigueScore >= 40
          ? 'MODERATE'
          : 'MINIMAL';

  const isMandatoryRestEnforced =
    hoursDrivenToday >= framework.maxDailyDrivingHours ||
    hoursDrivenThisWeek >= framework.maxWeeklyDrivingHours ||
    breakComplianceStatus === 'BREACH';

  const hasData = ordered.length > 0;

  const primaryRecommendation = !hasData
    ? 'Aucun trajet reconstruit sur la période : la charge de ce chauffeur n’est pas mesurable.'
    : hoursDrivenThisWeek >= framework.maxWeeklyDrivingHours
      ? `Plafond hebdomadaire atteint (${hoursDrivenThisWeek} h). Aucune mission avant le repos de ${framework.minWeeklyRestHours} h.`
      : hoursDrivenToday >= framework.maxDailyDrivingHours
        ? `Plafond journalier atteint. Repos de ${framework.minDailyRestHours} h avant reprise.`
        : breakComplianceStatus === 'BREACH'
          ? `Conduite continue au-delà de ${framework.mandatoryBreakAfterHours} h : pause de ${framework.mandatoryBreakDurationMinutes} min requise.`
          : consecutiveDaysWorked >= 6
            ? `${consecutiveDaysWorked} jours consécutifs travaillés : programmer un repos hebdomadaire.`
            : `Marge disponible : ${remainingDailyHours} h aujourd’hui, ${remainingWeeklyHours} h sur la semaine.`;

  const recommendedNextShiftStart =
    isMandatoryRestEnforced && latest
      ? new Date(latest.endedAt.getTime() + framework.minDailyRestHours * HOUR).toISOString()
      : undefined;

  return {
    driverId,
    fatigueScore: hasData ? fatigueScore : 0,
    fatigueLevel: hasData ? fatigueLevel : 'LOW',
    burnoutRisk: hasData ? burnoutRisk : 'MINIMAL',
    hoursDrivenToday,
    hoursDrivenThisWeek,
    nightHoursDrivenLast7Days,
    consecutiveDaysWorked,
    lastRestDurationHours,
    hoursSinceLastBreak,
    breakComplianceStatus: hasData ? breakComplianceStatus : 'COMPLIANT',
    maxDailyHoursLimit: framework.maxDailyDrivingHours,
    maxWeeklyHoursLimit: framework.maxWeeklyDrivingHours,
    remainingDailyHours,
    remainingWeeklyHours,
    isMandatoryRestEnforced: hasData && isMandatoryRestEnforced,
    recommendedNextShiftStart,
    primaryRecommendation,
    hasData,
    fatigueFactors: factors,
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function pct(ratio: number): number {
  return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
}
