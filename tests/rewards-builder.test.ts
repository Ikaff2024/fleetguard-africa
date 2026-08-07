import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BONUS_RULES,
  type DriverFuelUsage,
  buildLeaderboard,
  computeReward,
  measureConsumption,
  observedFuelPrice,
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

  it('calcule la prime sur les litres affichés, pas sur une décimale cachée', () => {
    // Un exploitant doit pouvoir refaire l'opération depuis l'écran :
    // « litres économisés × prix × part ». Sans arrondi unique, il tombe à
    // cent francs près et doute du reste.
    const reward = computeReward(
      { ...usage(), actualL100km: 29.9, expectedL100km: 36.5, distanceKm: 1096 },
      DEFAULT_BONUS_RULES,
    );

    const refait =
      DEFAULT_BONUS_RULES.baseTierBonus +
      reward.estimatedFuelSavedLiters *
        DEFAULT_BONUS_RULES.fuelPricePerLiter *
        (DEFAULT_BONUS_RULES.sharedSavingsPercentage / 100);

    expect(reward.bonusEarned).toBe(Math.round(refait));
  });

  it('respecte les règles de partage documentées', () => {
    expect(DEFAULT_BONUS_RULES.sharedSavingsPercentage).toBe(50);
    expect(DEFAULT_BONUS_RULES.minSafetyScoreForBonus).toBe(85);
    expect(DEFAULT_BONUS_RULES.maxMonthlyBonusCap).toBe(150_000);
  });
});

/**
 * Mesure de la consommation.
 *
 * Le défaut corrigé ici a été trouvé en production : un Volvo FH16 de
 * 40 tonnes affiché à 14,2 L/100 km, et 131 962 XOF versés sur cet écart.
 */
describe('Consommation mesurée d’un plein à l’autre', () => {
  const fill = (odometerKm: number, litersAdded: number) => ({
    loggedAt: new Date('2026-08-01T08:00:00.000Z'),
    odometerKm,
    litersAdded,
  });

  it('mesure entre le premier et le dernier plein', () => {
    // 1 000 km entre les deux pleins, 340 L versés au second.
    const result = measureConsumption([fill(100_000, 300), fill(101_000, 340)]);

    expect(result.actualL100km).toBe(34);
    expect(result.measuredDistanceKm).toBe(1000);
    // Les litres du premier plein ont servi avant la mesure : ils ne comptent
    // pas, sinon la consommation serait surestimée de moitié.
    expect(result.measuredLiters).toBe(340);
  });

  it('refuse de mesurer sur un seul plein', () => {
    // C'était l'erreur : diviser un plein isolé par toute la distance
    // parcourue faisait passer un 40 tonnes pour une citadine.
    const result = measureConsumption([fill(100_000, 198)]);

    expect(result.actualL100km).toBeUndefined();
    expect(result.reason).toContain('deux pleins');
  });

  it('refuse une distance trop courte pour être fiable', () => {
    const result = measureConsumption([fill(100_000, 300), fill(100_050, 20)]);

    expect(result.actualL100km).toBeUndefined();
    expect(result.reason).toContain('trop court');
  });

  it('écarte une consommation hors de toute plausibilité', () => {
    // Un plein oublié ou un compteur mal relevé : 2 L/100 km sur un poids
    // lourd signale une donnée manquante, pas une performance.
    const result = measureConsumption([fill(100_000, 300), fill(110_000, 200)]);

    expect(result.actualL100km).toBeUndefined();
    expect(result.reason).toContain('plausibilité');
  });

  it('additionne les pleins intermédiaires', () => {
    const result = measureConsumption([fill(100_000, 300), fill(100_500, 170), fill(101_000, 170)]);

    expect(result.measuredLiters).toBe(340);
    expect(result.measuredDistanceKm).toBe(1000);
    expect(result.actualL100km).toBe(34);
  });

  it('ordonne les pleins par compteur, pas par saisie', () => {
    // Une saisie hors ligne peut remonter dans le désordre.
    const result = measureConsumption([fill(101_000, 340), fill(100_000, 300)]);
    expect(result.actualL100km).toBe(34);
  });

  it('ne verse aucune prime quand la mesure est impossible', () => {
    const reward = computeReward(
      {
        driverId: 'drv-1',
        driverName: 'Koffi Mensah',
        safetyScore: 96,
        scoreTrend30d: 0,
        actualL100km: undefined,
        expectedL100km: 36.5,
        distanceKm: 0,
        measurementIssue: 'Au moins deux pleins sont nécessaires.',
      },
      DEFAULT_BONUS_RULES,
    );

    expect(reward.bonusEarned).toBe(0);
    expect(reward.ineligibilityReason).toContain('deux pleins');
  });
});

/**
 * Prix du gazole retenu pour la prime.
 *
 * La prime se calculait à 750 XOF le litre pendant que tous les pleins
 * enregistrés étaient à 700 : chaque litre épargné était valorisé 7 % trop
 * cher, et l'entreprise versait sur un prix qu'elle ne payait pas.
 */
describe('Prix du litre retenu', () => {
  const fill = (litersAdded: number, pricePerLiter: number) => ({
    litersAdded,
    totalCost: litersAdded * pricePerLiter,
  });

  it('retient le prix réellement payé plutôt que celui du produit', () => {
    const { pricePerLiter, basis } = observedFuelPrice([fill(400, 700), fill(300, 700)]);

    expect(pricePerLiter).toBe(700);
    expect(basis).toBe('OBSERVED');
  });

  it('pondère par les volumes, pas par le nombre de pleins', () => {
    // Dix litres à 800 et mille à 700 ne font pas 750 : une moyenne simple
    // laisserait un petit plein cher peser autant qu'un plein de tracteur.
    const { pricePerLiter } = observedFuelPrice([fill(10, 800), fill(1000, 700)]);

    expect(pricePerLiter).toBe(701);
  });

  it('revient au prix du produit quand rien n’a été relevé', () => {
    const { pricePerLiter, basis } = observedFuelPrice([]);

    expect(pricePerLiter).toBe(DEFAULT_BONUS_RULES.fuelPricePerLiter);
    expect(basis).toBe('DEFAULT');
  });

  it('écarte un relevé aberrant plutôt que de gonfler la masse des primes', () => {
    // Virgule mal placée ou devise mélangée : 70 000 XOF le litre multiplierait
    // toutes les primes par cent.
    const { pricePerLiter, basis } = observedFuelPrice([fill(400, 70_000)]);

    expect(pricePerLiter).toBe(DEFAULT_BONUS_RULES.fuelPricePerLiter);
    expect(basis).toBe('DEFAULT');
  });

  it('ignore les pleins sans montant, qui fausseraient la moyenne', () => {
    const { pricePerLiter } = observedFuelPrice([{ litersAdded: 400, totalCost: 0 }, fill(400, 700)]);

    expect(pricePerLiter).toBe(700);
  });
});
