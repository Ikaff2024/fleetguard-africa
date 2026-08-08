import { describe, expect, it } from 'vitest';
import {
  BADGE_RULES,
  type DriverBadgeMetrics,
  evaluateBadges,
} from '../src/server/services/badge-evaluator.js';

/**
 * Attribution des distinctions.
 *
 * Le catalogue affichait six critères précis qu'aucun code n'évaluait : un
 * badge n'attestait que du clic d'un régulateur. Une distinction qui ne
 * s'obtient pas ne motive personne, et un chauffeur qui atteint le critère
 * affiché sans rien recevoir conclut à raison que le dispositif est décoratif.
 */

function metrics(overrides: Partial<DriverBadgeMetrics> = {}): DriverBadgeMetrics {
  return {
    driverId: 'drv-1',
    safetyScore: 90,
    distanceKm: 4000,
    totalKmDriven: 40_000,
    nightHours: 0,
    overspeedCount: 0,
    harshBrakingCount: 0,
    severeEventCount: 0,
    consumptionSavingL100km: 0,
    ...overrides,
  };
}

const outcome = (m: DriverBadgeMetrics, code: string) => evaluateBadges(m).find(b => b.code === code)!;

describe('Distinctions', () => {
  it('évalue les six badges du catalogue, sans exception', () => {
    // Un badge affiché mais non évalué est exactement le défaut corrigé.
    expect(evaluateBadges(metrics())).toHaveLength(BADGE_RULES.length);
    expect(BADGE_RULES).toHaveLength(6);
  });

  it('n’accorde pas « zéro excès » à un camion resté au dépôt', () => {
    /**
     * Sans distance suffisante, une absence d'infraction ne prouve rien. C'est
     * le même raisonnement que pour le score de conduite, qui refuse d'être
     * représentatif sous un certain kilométrage.
     */
    const parked = outcome(metrics({ distanceKm: 120 }), 'ZERO_OVERSPEED_30D');

    expect(parked.earned).toBe(false);
    expect(parked.missing).toContain('880 km');
  });

  it('accorde « zéro excès » à un chauffeur qui a réellement roulé sans infraction', () => {
    expect(outcome(metrics({ distanceKm: 4000, overspeedCount: 0 }), 'ZERO_OVERSPEED_30D').earned).toBe(true);
  });

  it('refuse « zéro excès » dès la première infraction', () => {
    const one = outcome(metrics({ overspeedCount: 1 }), 'ZERO_OVERSPEED_30D');

    expect(one.earned).toBe(false);
    expect(one.missing).toContain('1 excès');
  });

  it('ne récompense pas l’éco-conduite quand la consommation n’est pas mesurable', () => {
    // L'absence de mesure n'est pas une contre-performance, mais elle n'ouvre
    // aucun droit : c'est la règle appliquée aux primes.
    const unmeasured = outcome(metrics({ consumptionSavingL100km: undefined }), 'ECO_CHAMPION_MASTER');

    expect(unmeasured.earned).toBe(false);
    expect(unmeasured.missing).toContain('deux pleins');
  });

  it('récompense une économie de carburant réellement mesurée', () => {
    // L'écart est négatif quand le chauffeur consomme moins que la référence.
    expect(outcome(metrics({ consumptionSavingL100km: -4.2 }), 'ECO_CHAMPION_MASTER').earned).toBe(true);
    expect(outcome(metrics({ consumptionSavingL100km: -3.4 }), 'ECO_CHAMPION_MASTER').earned).toBe(false);
  });

  it('exige les heures de nuit ET l’absence de freinage brusque', () => {
    expect(outcome(metrics({ nightHours: 25 }), 'NIGHT_GUARDIAN_SAFE').earned).toBe(true);
    expect(outcome(metrics({ nightHours: 25, harshBrakingCount: 1 }), 'NIGHT_GUARDIAN_SAFE').earned).toBe(
      false,
    );
    expect(outcome(metrics({ nightHours: 12 }), 'NIGHT_GUARDIAN_SAFE').earned).toBe(false);
  });

  it('refuse la distinction de corridor après une infraction grave', () => {
    // Le kilométrage seul ne suffit pas : c'est ce que dit le libellé.
    expect(outcome(metrics({ totalKmDriven: 40_000 }), 'CORRIDOR_LEGEND_10K').earned).toBe(true);
    expect(
      outcome(metrics({ totalKmDriven: 40_000, severeEventCount: 1 }), 'CORRIDOR_LEGEND_10K').earned,
    ).toBe(false);
  });

  it('mesure le freinage doux en ratio, pas en valeur absolue', () => {
    // Huit freinages sur 5 000 km valent mieux que trois sur 1 000 km.
    expect(outcome(metrics({ distanceKm: 5000, harshBrakingCount: 8 }), 'SMOOTH_BRAKER_PRO').earned).toBe(
      true,
    );
    expect(outcome(metrics({ distanceKm: 1000, harshBrakingCount: 3 }), 'SMOOTH_BRAKER_PRO').earned).toBe(
      false,
    );
  });

  it('dit ce qui manque, en termes exploitables par le chauffeur', () => {
    /**
     * « Critère non satisfait » ne se comprend pas. « Il vous reste 3 200 km »
     * se comprend, et indique quoi faire.
     */
    for (const badge of evaluateBadges(metrics({ distanceKm: 100, safetyScore: 60, nightHours: 0 }))) {
      if (badge.earned) continue;
      expect(badge.missing, badge.code).toBeTruthy();
      expect(badge.missing!.length, badge.code).toBeGreaterThan(15);
    }
  });

  it('affiche un critère qui décrit exactement ce qui est évalué', () => {
    // Le défaut d'origine tenait autant au libellé qu'à l'absence de calcul :
    // « corridors Cotonou-Niamey ou Dakar-Bamako » annonçait une évaluation que
    // l'application ne sait pas faire.
    const corridor = BADGE_RULES.find(rule => rule.code === 'CORRIDOR_LEGEND_10K')!;

    expect(corridor.criterion).not.toMatch(/Cotonou-Niamey|Dakar-Bamako/);
    expect(corridor.criterion).toMatch(/10 ?000 km/);
  });
});

/**
 * Cohérence entre ce qui est promis et ce qui est mesuré.
 *
 * Le défaut d'origine tenait autant au libellé qu'à l'absence de calcul. Ce
 * contrôle empêche les deux de diverger à nouveau : un critère qu'on modifie
 * dans le catalogue sans toucher à la règle, ou l'inverse, fait échouer la
 * suite.
 */
describe('Catalogue et règles', () => {
  it('affiche exactement le critère qui est évalué', async () => {
    const { MOCK_DIGITAL_BADGES } = await import('../src/data/mock-data.js');

    for (const rule of BADGE_RULES) {
      const catalogued = MOCK_DIGITAL_BADGES.find(badge => badge.code === rule.code);
      expect(catalogued, `badge ${rule.code} absent du catalogue`).toBeDefined();
      expect(catalogued!.criterion, `libellé divergent pour ${rule.code}`).toBe(rule.criterion);
    }
  });

  it('n’affiche aucun badge que le code ne sait pas évaluer', async () => {
    // L'inverse compte autant : un badge ajouté au catalogue sans règle
    // redevient décoratif, et personne ne s'en aperçoit.
    const { MOCK_DIGITAL_BADGES } = await import('../src/data/mock-data.js');
    const evaluated = new Set(BADGE_RULES.map(rule => rule.code));

    for (const badge of MOCK_DIGITAL_BADGES) {
      expect(evaluated.has(badge.code), `badge ${badge.code} affiché mais jamais évalué`).toBe(true);
    }
  });
});
