import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BONUS_RULES,
  type DriverFuelUsage,
  buildLeaderboard,
  computeReward,
} from '../src/server/services/rewards-builder.js';

/**
 * Calcul des primes.
 *
 * Une prime se verse en argent : elle doit s'expliquer devant le chauffeur qui
 * la touche comme devant le comptable qui la paie. Toute valeur non mesurée est
 * donc refusée, quitte à ne rien verser.
 */

function usage(overrides: Partial<DriverFuelUsage> = {}): DriverFuelUsage {
  return {
    driverId: 'drv-1',
    driverName: 'Koffi Mensah',
    safetyScore: 92,
    scoreTrend30d: 3,
    actualL100km: 28,
    expectedL100km: 34,
    distanceKm: 4000,
    ...overrides,
  };
}

describe('Primes de conduite économe', () => {
  it('récompense une consommation inférieure à la référence', () => {
    const reward = computeReward(usage(), DEFAULT_BONUS_RULES);

    expect(reward.eligible).toBe(true);
    expect(reward.estimatedFuelSavedLiters).toBe(240); // 6 L/100 km sur 4 000 km
    expect(reward.bonusEarned).toBeGreaterThan(0);
    expect(reward.fuelEfficiencySavingsL100km).toBe(-6);
  });

  it('refuse la prime en dessous du seuil de sécurité', () => {
    // Économiser du gazole en roulant vite ne mérite aucune récompense.
    const reward = computeReward(usage({ safetyScore: 70 }), DEFAULT_BONUS_RULES);

    expect(reward.eligible).toBe(false);
    expect(reward.bonusEarned).toBe(0);
    expect(reward.ineligibilityReason).toContain('70');
  });

  it('ne verse rien quand aucun plein n’a été relevé', () => {
    // Sans mesure, il n'y a pas d'économie : ni le chauffeur ni l'entreprise
    // ne doivent être engagés sur une estimation.
    const reward = computeReward(
      usage({ actualL100km: undefined, expectedL100km: undefined }),
      DEFAULT_BONUS_RULES,
    );

    expect(reward.eligible).toBe(false);
    expect(reward.bonusEarned).toBe(0);
    expect(reward.estimatedFuelSavedLiters).toBe(0);
    expect(reward.ineligibilityReason).toContain('non mesurable');
  });

  it('ne verse rien quand la consommation dépasse la référence', () => {
    const reward = computeReward(usage({ actualL100km: 40 }), DEFAULT_BONUS_RULES);

    expect(reward.eligible).toBe(false);
    expect(reward.fuelEfficiencySavingsL100km).toBe(6);
  });

  it('plafonne la prime malgré une donnée aberrante', () => {
    // Un relevé de compteur erroné suffirait à produire une économie
    // fantaisiste : le plafond protège la trésorerie de l'entreprise.
    const reward = computeReward(
      usage({ actualL100km: 1, expectedL100km: 34, distanceKm: 900_000 }),
      DEFAULT_BONUS_RULES,
    );

    expect(reward.bonusEarned).toBe(DEFAULT_BONUS_RULES.maxMonthlyBonusCap);
  });

  it('ne place pas en tête un chauffeur rapide mais dangereux', () => {
    const classement = buildLeaderboard([
      usage({ driverId: 'sobre-et-sur', driverName: 'Aïcha', safetyScore: 95 }),
      usage({ driverId: 'sobre-mais-dangereux', driverName: 'Ibrahim', safetyScore: 55 }),
    ]);

    expect(classement[0]!.driverId).toBe('sobre-et-sur');
    expect(classement[0]!.rankInCompany).toBe(1);
    expect(classement[1]!.rankInCompany).toBe(2);
  });

  it('attribue un rang à chaque chauffeur, sans trou', () => {
    const classement = buildLeaderboard([
      usage({ driverId: 'a', distanceKm: 1000 }),
      usage({ driverId: 'b', distanceKm: 5000 }),
      usage({ driverId: 'c', distanceKm: 3000 }),
    ]);

    expect(classement.map(r => r.rankInCompany)).toEqual([1, 2, 3]);
  });

  it('respecte les règles de partage documentées', () => {
    expect(DEFAULT_BONUS_RULES.sharedSavingsPercentage).toBe(50);
    expect(DEFAULT_BONUS_RULES.minSafetyScoreForBonus).toBe(85);
    expect(DEFAULT_BONUS_RULES.maxMonthlyBonusCap).toBe(150_000);
  });
});
