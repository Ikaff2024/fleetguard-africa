import { describe, expect, it } from 'vitest';
import { DEFAULT_FRAMEWORK, type FatigueMetrics } from '../src/server/services/fatigue-builder.js';
import {
  DEFAULT_CORRIDOR_SPEED_KMH,
  type ExistingAssignment,
  assessMission,
  paceOf,
} from '../src/server/services/mission-planner.js';

/**
 * Faisabilité d'une mission.
 *
 * Le calendrier n'est pas le sujet : un tableur en fait autant. Ce qui compte
 * est le refus — et qu'il repose sur des heures mesurées, pas déclarées.
 */

const START = new Date('2026-08-10T06:00:00.000Z');

function fatigue(overrides: Partial<FatigueMetrics> = {}): FatigueMetrics {
  return {
    driverId: 'drv-1',
    fatigueScore: 20,
    fatigueLevel: 'LOW',
    burnoutRisk: 'MINIMAL',
    hoursDrivenToday: 0,
    hoursDrivenThisWeek: 10,
    nightHoursDrivenLast7Days: 0,
    consecutiveDaysWorked: 2,
    lastRestDurationHours: 12,
    hoursSinceLastBreak: 0,
    breakComplianceStatus: 'COMPLIANT',
    maxDailyHoursLimit: DEFAULT_FRAMEWORK.maxDailyDrivingHours,
    maxWeeklyHoursLimit: DEFAULT_FRAMEWORK.maxWeeklyDrivingHours,
    remainingDailyHours: 9,
    remainingWeeklyHours: 46,
    isMandatoryRestEnforced: false,
    primaryRecommendation: 'Marge disponible.',
    hasData: true,
    fatigueFactors: [],
    ...overrides,
  };
}

const HEALTHY_PACE = { tripCount: 12, totalDistanceKm: 4800, totalDrivingHours: 80 }; // 60 km/h

function assess(
  distanceKm: number,
  metrics = fatigue(),
  existing: ExistingAssignment[] = [],
  pace = HEALTHY_PACE,
) {
  return assessMission(
    { driverId: 'drv-1', vehicleId: 'veh-1', scheduledStart: START, plannedDistanceKm: distanceKm },
    metrics,
    DEFAULT_FRAMEWORK,
    existing,
    pace,
  );
}

describe('Faisabilité d’une mission', () => {
  it('accepte une mission dans les plafonds', () => {
    const result = assess(240);

    expect(result.feasible).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.plannedDrivingHours).toBe(4);
  });

  it('refuse une mission qui dépasse le plafond hebdomadaire', () => {
    // 52 h déjà conduites, plafond à 56 : une mission de 300 km ne passe pas.
    const result = assess(300, fatigue({ hoursDrivenThisWeek: 52 }));

    expect(result.feasible).toBe(false);
    expect(result.blockers.map(b => b.code)).toContain('WEEKLY_LIMIT');
    // Le motif cite les deux chiffres : un refus qu'on ne peut pas expliquer
    // au gestionnaire sera contourné.
    expect(result.blockers[0]!.message).toContain('52');
    expect(result.blockers[0]!.message).toContain('56');
  });

  it('refuse d’engager un chauffeur en repos réglementaire', () => {
    const result = assess(
      100,
      fatigue({ isMandatoryRestEnforced: true, primaryRecommendation: 'Plafond journalier atteint.' }),
    );

    expect(result.feasible).toBe(false);
    expect(result.blockers.map(b => b.code)).toContain('REST_REQUIRED');
  });

  it('refuse un chauffeur déjà engagé sur le créneau', () => {
    const existing: ExistingAssignment[] = [
      {
        id: 'm-1',
        driverId: 'drv-1',
        vehicleId: 'veh-9',
        scheduledStart: new Date(START.getTime() + 3_600_000),
        scheduledEnd: new Date(START.getTime() + 5 * 3_600_000),
      },
    ];

    const result = assess(240, fatigue(), existing);
    expect(result.blockers.map(b => b.code)).toContain('DRIVER_BUSY');
  });

  it('refuse un véhicule déjà engagé sur le créneau', () => {
    const existing: ExistingAssignment[] = [
      {
        id: 'm-1',
        driverId: 'drv-9',
        vehicleId: 'veh-1',
        scheduledStart: new Date(START.getTime() + 3_600_000),
        scheduledEnd: new Date(START.getTime() + 5 * 3_600_000),
      },
    ];

    const result = assess(240, fatigue(), existing);
    expect(result.blockers.map(b => b.code)).toContain('VEHICLE_BUSY');
  });

  it('n’oppose pas une mission qui ne chevauche pas', () => {
    const existing: ExistingAssignment[] = [
      {
        id: 'm-1',
        driverId: 'drv-1',
        vehicleId: 'veh-1',
        scheduledStart: new Date(START.getTime() + 48 * 3_600_000),
        scheduledEnd: new Date(START.getTime() + 52 * 3_600_000),
      },
    ];

    expect(assess(240, fatigue(), existing).feasible).toBe(true);
  });

  it('ajoute les pauses obligatoires à l’heure d’arrivée', () => {
    // Sans elles, l'heure annoncée serait intenable — et c'est ainsi qu'on
    // pousse un chauffeur à rouler sans s'arrêter pour la tenir.
    const sansPause = assess(180); // 3 h, sous le seuil de 4 h 30
    const avecPause = assess(360); // 6 h, une pause de 45 min s'impose

    const dureeSans = sansPause.scheduledEnd.getTime() - START.getTime();
    const dureeAvec = avecPause.scheduledEnd.getTime() - START.getTime();

    expect(dureeSans / 3_600_000).toBeCloseTo(3, 1);
    expect(dureeAvec / 3_600_000).toBeCloseTo(6.75, 1);
  });

  it('estime la durée sur la vitesse observée de la flotte', () => {
    const result = assess(240);
    expect(result.speedBasis).toBe('OBSERVED');
    expect(result.assumedSpeedKmH).toBe(60);
  });

  it('retombe sur une moyenne documentée sans historique suffisant', () => {
    const result = assess(240, fatigue(), [], { tripCount: 1, totalDistanceKm: 80, totalDrivingHours: 1 });

    expect(result.speedBasis).toBe('DEFAULT');
    expect(result.assumedSpeedKmH).toBe(DEFAULT_CORRIDOR_SPEED_KMH);
    // L'écran doit dire d'où vient l'estimation, sinon elle passe pour une
    // mesure.
    expect(result.warnings.join(' ')).toContain('faute de trajets suffisants');
  });

  it('écarte une vitesse observée aberrante', () => {
    // 400 km/h : la donnée est incomplète, pas le chauffeur exceptionnel.
    expect(paceOf({ tripCount: 20, totalDistanceKm: 8000, totalDrivingHours: 20 }).basis).toBe('DEFAULT');
  });

  it('prévient d’une mission plus longue qu’une journée de conduite', () => {
    const result = assess(700, fatigue({ hoursDrivenThisWeek: 0 }));
    expect(result.warnings.join(' ')).toContain('relais');
  });

  it('signale une marge hebdomadaire qui se referme', () => {
    const result = assess(120, fatigue({ hoursDrivenThisWeek: 50 }));

    expect(result.feasible).toBe(true);
    expect(result.warnings.join(' ')).toContain('plafond hebdomadaire');
  });
});
