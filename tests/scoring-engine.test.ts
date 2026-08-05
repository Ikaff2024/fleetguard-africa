import { describe, expect, it } from 'vitest';
import {
  calculateDriverSafetyScore,
  calculateFuelEfficiencyScore,
  calculateVehicleHealthScore,
} from '../src/data/scoring-engine.js';
import type { DriverScoreConfig } from '../src/types';

/**
 * Le score de sécurité conditionne des sanctions et des primes versées à des
 * chauffeurs. Il doit être déterministe, borné et explicable : ces tests
 * verrouillent ces trois propriétés.
 */

const config: DriverScoreConfig = {
  id: 'cfg_test',
  organizationId: 'org_test',
  version: 1,
  weights: {
    overspeedWeight: 35,
    harshBrakingWeight: 25,
    rapidAccelWeight: 15,
    fatigueNightWeight: 15,
    geofenceBreachWeight: 10,
  },
  normalizationDistanceKm: 100,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const cleanRun = {
  distanceDrivenKm: 500,
  overspeedEventsCount: 0,
  harshBrakingEventsCount: 0,
  rapidAccelEventsCount: 0,
  nightHoursDriven: 0,
  geofenceBreachesCount: 0,
};

describe('calculateDriverSafetyScore', () => {
  it('attribue 100/100 à une conduite sans incident', () => {
    const result = calculateDriverSafetyScore(cleanRun, config);

    expect(result.score).toBe(100);
    expect(result.totalPenalties).toBe(0);
    expect(result.explanations).toHaveLength(1);
    expect(result.explanations[0].category).toBe('Conduite Exemplaire');
  });

  it('reste borné entre 0 et 100 même sous un déluge d’infractions', () => {
    const result = calculateDriverSafetyScore(
      {
        distanceDrivenKm: 100,
        overspeedEventsCount: 500,
        harshBrakingEventsCount: 500,
        rapidAccelEventsCount: 500,
        nightHoursDriven: 500,
        geofenceBreachesCount: 500,
      },
      config,
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('est déterministe : deux calculs identiques donnent le même score', () => {
    const input = { ...cleanRun, overspeedEventsCount: 3, harshBrakingEventsCount: 2 };

    expect(calculateDriverSafetyScore(input, config)).toEqual(calculateDriverSafetyScore(input, config));
  });

  it('normalise par la distance : le même nombre d’incidents pèse moins sur un long trajet', () => {
    const shortTrip = calculateDriverSafetyScore(
      { ...cleanRun, distanceDrivenKm: 100, overspeedEventsCount: 5 },
      config,
    );
    const longTrip = calculateDriverSafetyScore(
      { ...cleanRun, distanceDrivenKm: 1000, overspeedEventsCount: 5 },
      config,
    );

    expect(longTrip.score).toBeGreaterThan(shortTrip.score);
  });

  it('ne divise jamais par zéro sur une distance nulle', () => {
    const result = calculateDriverSafetyScore(
      { ...cleanRun, distanceDrivenKm: 0, overspeedEventsCount: 1 },
      config,
    );

    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('produit une explication chiffrée pour chaque pénalité appliquée', () => {
    const result = calculateDriverSafetyScore(
      {
        distanceDrivenKm: 300,
        overspeedEventsCount: 2,
        harshBrakingEventsCount: 1,
        rapidAccelEventsCount: 1,
        nightHoursDriven: 3,
        geofenceBreachesCount: 1,
      },
      config,
    );

    // Un chauffeur doit pouvoir contester : chaque point perdu est justifié.
    expect(result.explanations).toHaveLength(5);
    for (const explanation of result.explanations) {
      expect(explanation.pointsLost).toBeGreaterThan(0);
      expect(explanation.reason.length).toBeGreaterThan(10);
    }

    const sumOfExplained = result.explanations.reduce((acc, e) => acc + e.pointsLost, 0);
    expect(sumOfExplained).toBeCloseTo(result.totalPenalties, 1);
  });

  it('plafonne chaque catégorie à son poids maximal', () => {
    const result = calculateDriverSafetyScore(
      { ...cleanRun, distanceDrivenKm: 100, overspeedEventsCount: 1000 },
      config,
    );

    expect(result.breakdown.overspeedPenalty).toBeLessThanOrEqual(35);
  });

  it('respecte la configuration : un poids plus élevé pénalise davantage', () => {
    const severeConfig: DriverScoreConfig = {
      ...config,
      weights: { ...config.weights, overspeedWeight: 70 },
    };
    const input = { ...cleanRun, overspeedEventsCount: 3 };

    const standard = calculateDriverSafetyScore(input, config);
    const severe = calculateDriverSafetyScore(input, severeConfig);

    expect(severe.score).toBeLessThan(standard.score);
  });
});

describe('calculateVehicleHealthScore', () => {
  it('donne 100 à un véhicule à jour', () => {
    expect(calculateVehicleHealthScore(50_000, 45_000, 60_000, 0)).toBe(100);
  });

  it('pénalise le dépassement d’échéance de révision', () => {
    const late = calculateVehicleHealthScore(70_000, 45_000, 60_000, 0);
    expect(late).toBeLessThan(100);
    expect(late).toBeGreaterThanOrEqual(0);
  });

  it('reste borné même en situation catastrophique', () => {
    expect(calculateVehicleHealthScore(500_000, 10_000, 20_000, 10)).toBe(0);
  });
});

describe('calculateFuelEfficiencyScore', () => {
  it('classe une consommation conforme comme excellente', () => {
    expect(calculateFuelEfficiencyScore(34, 34).status).toBe('EXCELLENT');
  });

  it('signale un vol probable au-delà de 35 % d’écart', () => {
    // 34 L/100km attendus, 48.5 relevés : c'est le scénario de siphonnage.
    const result = calculateFuelEfficiencyScore(34, 48.5);
    expect(result.status).toBe('SUSPECTED_THEFT');
  });

  it('ne conclut rien en l’absence de mesure', () => {
    expect(calculateFuelEfficiencyScore(34, 0).status).toBe('NORMAL');
  });
});
