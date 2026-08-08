/**
 * Attribution des distinctions.
 *
 * Le catalogue affichait six badges assortis de critères précis — « cumul
 * ≥ 10 000 km sans alerte majeure », « ≥ 20 h de conduite de nuit sans freinage
 * brusque » — et aucun code ne les évaluait. Aucun kilomètre, aucune heure de
 * nuit, aucun freinage n'était jamais compté : un badge n'attestait que du clic
 * d'un régulateur, et l'écran affichait « Détenteurs (0) » sur toute la ligne.
 *
 * Une distinction qui ne s'obtient pas ne motive personne. Pire : un chauffeur
 * qui atteint le critère affiché et ne reçoit rien conclut, à raison, que le
 * dispositif est décoratif.
 *
 * Les six critères sont désormais évalués sur des faits mesurés. Un seul a dû
 * être reformulé : « corridors Cotonou-Niamey ou Dakar-Bamako » supposait
 * d'identifier un corridor sur une trace, ce que l'application ne sait pas
 * faire. Le kilométrage sans incident grave, lui, se compte — et c'est ce que
 * le libellé annonce maintenant.
 */

export interface DriverBadgeMetrics {
  driverId: string;
  /** Score de conduite en vigueur, calculé sur trente jours. */
  safetyScore: number;
  /** Distance des trajets reconstruits sur la période. */
  distanceKm: number;
  /** Kilométrage cumulé du chauffeur, toutes périodes confondues. */
  totalKmDriven: number;
  /** Heures de conduite entre 22 h et 6 h sur la période. */
  nightHours: number;
  overspeedCount: number;
  harshBrakingCount: number;
  /** Infractions graves — celles qui interdisent une distinction. */
  severeEventCount: number;
  /**
   * Écart à la consommation de référence, en L/100 km. Négatif quand le
   * chauffeur consomme moins. `undefined` quand la mesure est impossible.
   */
  consumptionSavingL100km?: number;
}

export interface BadgeRule {
  code: string;
  /** Libellé affiché — il doit décrire exactement ce qui est évalué. */
  criterion: string;
  /**
   * Renvoie `null` quand le badge est acquis, sinon le motif qui manque.
   *
   * Le motif est rendu à l'écran : « il vous reste 3 200 km » se comprend,
   * « critère non satisfait » ne se comprend pas.
   */
  evaluate: (metrics: DriverBadgeMetrics) => string | null;
}

/** Distance minimale pour qu'une absence d'infraction ait valeur de preuve. */
const SIGNIFICANT_DISTANCE_KM = 1000;

const km = (value: number) => `${Math.round(value).toLocaleString('fr-FR')} km`;

export const BADGE_RULES: BadgeRule[] = [
  {
    code: 'ZERO_OVERSPEED_30D',
    criterion: 'Aucun excès de vitesse relevé sur 30 jours, pour plus de 1 000 km parcourus.',
    evaluate: m => {
      // Sans distance suffisante, zéro infraction ne prouve rien : un camion
      // resté au dépôt n'a pas mérité de distinction.
      if (m.distanceKm < SIGNIFICANT_DISTANCE_KM) {
        return `${km(SIGNIFICANT_DISTANCE_KM - m.distanceKm)} manquants pour que l’absence d’excès soit probante.`;
      }
      if (m.overspeedCount > 0) {
        return `${m.overspeedCount} excès de vitesse relevé(s) sur la période.`;
      }
      return null;
    },
  },
  {
    code: 'ECO_CHAMPION_MASTER',
    criterion: 'Consommation inférieure d’au moins 3,5 L/100 km à la référence du véhicule.',
    evaluate: m => {
      if (m.consumptionSavingL100km === undefined) {
        return 'Consommation non mesurable : deux pleins au moins sont nécessaires.';
      }
      const saving = -m.consumptionSavingL100km;
      if (saving < 3.5) {
        return `Écart de ${saving.toFixed(1)} L/100 km sous la référence ; 3,5 sont demandés.`;
      }
      return null;
    },
  },
  {
    code: 'NIGHT_GUARDIAN_SAFE',
    criterion: 'Au moins 20 h de conduite de nuit (22 h – 6 h) sans aucun freinage brusque.',
    evaluate: m => {
      if (m.nightHours < 20) {
        return `${(20 - m.nightHours).toFixed(1)} h de conduite de nuit manquantes.`;
      }
      if (m.harshBrakingCount > 0) {
        return `${m.harshBrakingCount} freinage(s) brusque(s) relevé(s) sur la période.`;
      }
      return null;
    },
  },
  {
    code: 'CORRIDOR_LEGEND_10K',
    criterion: 'Plus de 10 000 km au compteur, sans aucune infraction grave sur la période.',
    evaluate: m => {
      if (m.totalKmDriven < 10_000) {
        return `${km(10_000 - m.totalKmDriven)} manquants au compteur.`;
      }
      if (m.severeEventCount > 0) {
        return `${m.severeEventCount} infraction(s) grave(s) relevée(s) sur la période.`;
      }
      return null;
    },
  },
  {
    code: 'SMOOTH_BRAKER_PRO',
    criterion: 'Moins de 2 freinages brusques pour 1 000 km, sur au moins 1 000 km parcourus.',
    evaluate: m => {
      if (m.distanceKm < SIGNIFICANT_DISTANCE_KM) {
        return `${km(SIGNIFICANT_DISTANCE_KM - m.distanceKm)} manquants pour que le ratio ait un sens.`;
      }
      const ratio = (m.harshBrakingCount / m.distanceKm) * 1000;
      if (ratio >= 2) {
        return `${ratio.toFixed(1)} freinage(s) brusque(s) pour 1 000 km ; moins de 2 sont demandés.`;
      }
      return null;
    },
  },
  {
    code: 'PERFECT_SCORE_95',
    criterion: 'Score de conduite d’au moins 95/100.',
    evaluate: m =>
      m.safetyScore >= 95 ? null : `Score de ${m.safetyScore.toFixed(0)}/100 ; 95 sont demandés.`,
  },
];

export interface BadgeOutcome {
  code: string;
  criterion: string;
  earned: boolean;
  /** Ce qui manque encore, rendu tel quel à l'écran. */
  missing?: string;
}

/**
 * Évalue les six règles pour un chauffeur.
 *
 * Rien n'est attribué ici : la fonction constate. C'est le dépôt qui écrit, et
 * seulement pour les distinctions nouvellement acquises — un badge obtenu reste
 * acquis même si le mois suivant est moins bon, comme une médaille.
 */
export function evaluateBadges(metrics: DriverBadgeMetrics): BadgeOutcome[] {
  return BADGE_RULES.map(rule => {
    const missing = rule.evaluate(metrics);
    return {
      code: rule.code,
      criterion: rule.criterion,
      earned: missing === null,
      ...(missing === null ? {} : { missing }),
    };
  });
}
