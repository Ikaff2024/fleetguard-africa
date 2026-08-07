import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FRAMEWORK,
  LEGAL_FRAMEWORKS,
  type TripWindow,
  computeFatigue,
} from '../src/server/services/fatigue-builder.js';

/**
 * Mesure de la fatigue.
 *
 * L'enjeu est double : un chauffeur épuisé au volant d'un semi-remorque met des
 * vies en jeu, et un chiffre contestable ruinerait la confiance dans l'outil.
 * Tout se déduit donc des trajets reconstruits, jamais d'une saisie.
 */

const NOW = new Date('2026-08-07T18:00:00.000Z');

function trip(startHoursAgo: number, durationHours: number, stopHours = 0): TripWindow {
  const startedAt = new Date(NOW.getTime() - startHoursAgo * 3_600_000);
  const endedAt = new Date(startedAt.getTime() + durationHours * 3_600_000);
  return {
    startedAt,
    endedAt,
    durationSeconds: durationHours * 3600,
    stopSeconds: stopHours * 3600,
    distanceKm: durationHours * 70,
  };
}

describe('Mesure de la fatigue', () => {
  it('ne mesure rien quand aucun trajet n’a été reconstruit', () => {
    const metrics = computeFatigue('drv-1', [], DEFAULT_FRAMEWORK, NOW);

    // Afficher « faible risque » sur un chauffeur dont on ne sait rien serait
    // un mensonge rassurant : l'absence de mesure doit se dire.
    expect(metrics.hasData).toBe(false);
    expect(metrics.fatigueScore).toBe(0);
    expect(metrics.primaryRecommendation).toContain('pas mesurable');
  });

  it('ne compte pas le temps d’arrêt comme du temps de conduite', () => {
    // Deux heures de chargement au port ne fatiguent pas comme deux heures de
    // volant.
    const roulant = computeFatigue('drv-1', [trip(6, 6, 0)], DEFAULT_FRAMEWORK, NOW);
    const avecPause = computeFatigue('drv-1', [trip(6, 6, 2)], DEFAULT_FRAMEWORK, NOW);

    expect(roulant.hoursDrivenToday).toBe(6);
    expect(avecPause.hoursDrivenToday).toBe(4);
  });

  it('impose un repos quand le plafond journalier est atteint', () => {
    const metrics = computeFatigue('drv-1', [trip(10, 9.5)], DEFAULT_FRAMEWORK, NOW);

    expect(metrics.isMandatoryRestEnforced).toBe(true);
    expect(metrics.remainingDailyHours).toBe(0);
    expect(metrics.recommendedNextShiftStart).toBeTruthy();
  });

  it('compte les heures de nuit même sur un trajet à cheval sur minuit', () => {
    // Un départ à 21 h pour six heures traverse la frontière jour/nuit :
    // approximer par l'heure de départ fausserait tout sur un long corridor.
    const startedAt = new Date('2026-08-06T21:00:00.000Z');
    const nocturne: TripWindow = {
      startedAt,
      endedAt: new Date(startedAt.getTime() + 6 * 3_600_000),
      durationSeconds: 6 * 3600,
      stopSeconds: 0,
      distanceKm: 420,
    };

    const metrics = computeFatigue('drv-1', [nocturne], DEFAULT_FRAMEWORK, NOW);
    expect(metrics.nightHoursDrivenLast7Days).toBeGreaterThan(0);
  });

  it('compte les jours consécutifs travaillés', () => {
    const trips = [0, 1, 2, 3].map(day => trip(day * 24 + 6, 5));
    const metrics = computeFatigue('drv-1', trips, DEFAULT_FRAMEWORK, NOW);

    expect(metrics.consecutiveDaysWorked).toBeGreaterThanOrEqual(4);
  });

  it('signale un enchaînement sans repos hebdomadaire', () => {
    const trips = Array.from({ length: 7 }, (_, day) => trip(day * 24 + 6, 7));
    const metrics = computeFatigue('drv-1', trips, DEFAULT_FRAMEWORK, NOW);

    expect(metrics.burnoutRisk).toBe('CRITICAL_BURNOUT');
    expect(metrics.fatigueLevel === 'HIGH' || metrics.fatigueLevel === 'CRITICAL').toBe(true);
  });

  it('ne réclame pas de pause à un chauffeur déjà rentré', () => {
    // Un trajet de six heures terminé hier ne constitue pas une conduite
    // continue en cours. Réclamer une pause immédiate dans ce cas ferait cesser
    // de lire l'écran, et les vraies alertes s'y perdraient.
    const metrics = computeFatigue('drv-1', [trip(30, 6)], DEFAULT_FRAMEWORK, NOW);

    expect(metrics.hoursSinceLastBreak).toBe(0);
    expect(metrics.breakComplianceStatus).toBe('COMPLIANT');
    expect(metrics.primaryRecommendation).not.toContain('pause');
  });

  it('signale la conduite continue d’un chauffeur encore au volant', () => {
    // Trajet clos il y a quelques minutes : la conduite est bien en cours.
    const metrics = computeFatigue('drv-1', [trip(5, 5)], DEFAULT_FRAMEWORK, NOW);

    expect(metrics.hoursSinceLastBreak).toBeGreaterThan(DEFAULT_FRAMEWORK.mandatoryBreakAfterHours);
    expect(metrics.breakComplianceStatus).toBe('BREACH');
  });

  it('reste au repos pour un chauffeur qui a peu roulé', () => {
    const metrics = computeFatigue('drv-1', [trip(30, 2)], DEFAULT_FRAMEWORK, NOW);

    expect(metrics.fatigueLevel).toBe('LOW');
    expect(metrics.isMandatoryRestEnforced).toBe(false);
    expect(metrics.remainingDailyHours).toBe(DEFAULT_FRAMEWORK.maxDailyDrivingHours);
  });

  it('applique le cadre régional demandé', () => {
    const eac = LEGAL_FRAMEWORKS.find(f => f.region === 'EAC_EAST_AFRICA')!;
    const metrics = computeFatigue('drv-1', [trip(10, 8.5)], eac, NOW);

    // Huit heures et demie passent en UEMOA (plafond 9 h), pas en EAC (8 h).
    expect(metrics.maxDailyHoursLimit).toBe(8);
    expect(metrics.isMandatoryRestEnforced).toBe(true);
  });

  it('expose des cadres réglementaires cohérents', () => {
    for (const framework of LEGAL_FRAMEWORKS) {
      expect(framework.maxDailyDrivingHours).toBeGreaterThan(0);
      expect(framework.maxWeeklyDrivingHours).toBeGreaterThan(framework.maxDailyDrivingHours);
      expect(framework.mandatoryBreakDurationMinutes).toBeGreaterThan(0);
    }
  });
});
