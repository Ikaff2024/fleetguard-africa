import { describe, expect, it } from 'vitest';
import type { GpsPoint } from '../src/types';
import { segmentTrips } from '../src/server/services/trip-builder.js';

/**
 * Découpage de la trace en trajets.
 *
 * L'enjeu est le corridor africain : une coupure réseau d'une heure y est
 * banale. Un découpage trop zélé transformerait un Cotonou-Parakou en trois
 * trajets, et rendrait tout rapport de ponctualité inexploitable.
 */

const clock = Date.parse('2026-08-06T06:00:00.000Z');

function pointAt(minutesFromStart: number, speedKmH: number, overrides: Partial<GpsPoint> = {}): GpsPoint {
  return {
    latitude: 6.37 + minutesFromStart * 0.01,
    longitude: 2.42 + minutesFromStart * 0.005,
    speedKmH,
    headingDegree: 30,
    timestamp: new Date(clock + minutesFromStart * 60_000).toISOString(),
    accuracyMeters: 5,
    ignitionOn: true,
    batteryLevelPct: 90,
    networkType: '3G',
    ...overrides,
  };
}

describe('Découpage des trajets', () => {
  it('reconstruit un trajet continu avec distance et durée', () => {
    const points = [0, 10, 20, 30, 40].map(m => pointAt(m, 70));
    const trips = segmentTrips(points);

    expect(trips).toHaveLength(1);
    expect(trips[0]!.distanceKm).toBeGreaterThan(0);
    expect(trips[0]!.durationSeconds).toBe(40 * 60);
    expect(trips[0]!.pointCount).toBe(5);
    // La pointe est au moins la vitesse déclarée ; elle peut la dépasser si le
    // déplacement entre deux points implique d'avoir roulé plus vite.
    expect(trips[0]!.maxSpeedKmH).toBeGreaterThanOrEqual(70);
  });

  it('termine le trajet quand le contact est coupé', () => {
    const points = [
      pointAt(0, 60),
      pointAt(10, 65),
      pointAt(20, 0, { ignitionOn: false }),
      // Nouveau départ une heure plus tard.
      pointAt(80, 55),
      pointAt(90, 60),
      pointAt(100, 62),
    ];

    const trips = segmentTrips(points);
    expect(trips).toHaveLength(2);
  });

  it('ne coupe pas un trajet pour une pause de dix minutes', () => {
    // Un arrêt à un poste de péage ou un contrôle ne termine pas la mission.
    const points = [
      pointAt(0, 70),
      pointAt(10, 70),
      pointAt(15, 0),
      pointAt(25, 0),
      pointAt(30, 70),
      pointAt(40, 70),
    ];

    const trips = segmentTrips(points);
    expect(trips).toHaveLength(1);
    // La pause est comptée comme un arrêt, sans rompre le trajet.
    expect(trips[0]!.stopCount).toBeGreaterThanOrEqual(1);
    expect(trips[0]!.stopSeconds).toBeGreaterThan(0);
  });

  it('termine le trajet après une immobilité prolongée', () => {
    const points = [
      pointAt(0, 70),
      pointAt(10, 70),
      pointAt(20, 0),
      pointAt(50, 0), // 30 minutes à l'arrêt
      pointAt(60, 70),
      pointAt(70, 70),
    ];

    expect(segmentTrips(points).length).toBeGreaterThanOrEqual(2);
  });

  it('ne découpe pas un trajet sur une coupure réseau ordinaire', () => {
    // Une heure sans signal sur un corridor : le camion roulait toujours.
    const points = [pointAt(0, 75), pointAt(10, 75), pointAt(70, 75), pointAt(80, 75)];

    expect(segmentTrips(points)).toHaveLength(1);
  });

  it('sépare deux trajets quand la trace manque trop longtemps', () => {
    // Trois heures sans point : impossible d'affirmer ce qui s'est passé.
    const points = [pointAt(0, 70), pointAt(10, 70), pointAt(190, 70), pointAt(200, 70)];

    expect(segmentTrips(points)).toHaveLength(2);
  });

  it('ignore une manœuvre de quelques mètres', () => {
    const points = [
      { ...pointAt(0, 4), latitude: 6.37, longitude: 2.42 },
      { ...pointAt(1, 4), latitude: 6.3701, longitude: 2.4201 },
    ];

    expect(segmentTrips(points)).toHaveLength(0);
  });

  it('calcule la vitesse moyenne hors temps d’arrêt', () => {
    // Une moyenne incluant deux heures de chargement ne dirait rien du style
    // de conduite du chauffeur.
    const roulant = segmentTrips([0, 10, 20].map(m => pointAt(m, 80)));
    const avecPause = segmentTrips([
      pointAt(0, 80),
      pointAt(10, 80),
      pointAt(12, 0),
      pointAt(22, 0),
      pointAt(32, 80),
    ]);

    expect(roulant[0]!.avgSpeedKmH).toBeGreaterThan(0);
    expect(avecPause[0]!.stopSeconds).toBeGreaterThan(0);
    // Sans exclusion des arrêts, la moyenne s'effondrerait artificiellement.
    expect(avecPause[0]!.avgSpeedKmH).toBeGreaterThan(20);
  });

  it('ne présente jamais une moyenne supérieure à la pointe', () => {
    // Un tableau annonçant 149 km/h de moyenne et 98 km/h de pointe ruine la
    // crédibilité du rapport. La pointe croise les deux sources : vitesse
    // déclarée et vitesse déduite des positions.
    const trips = segmentTrips([0, 1, 2, 3, 4, 5].map(m => pointAt(m, 70)));

    expect(trips).toHaveLength(1);
    expect(trips[0]!.maxSpeedKmH).toBeGreaterThanOrEqual(trips[0]!.avgSpeedKmH);
  });

  it('retient la vitesse déduite des positions quand le boîtier sous-déclare', () => {
    // Deux kilomètres en une minute : le véhicule a roulé à 120 km/h, quoi
    // qu'ait déclaré son matériel. C'est ce qui empêche un boîtier mal réglé
    // de dissimuler un excès.
    const base = Date.parse('2026-08-06T06:00:00.000Z');
    const points: GpsPoint[] = [0, 1, 2].map(minute => ({
      latitude: 6.37 + minute * 0.018,
      longitude: 2.42,
      speedKmH: 40, // déclaration manifestement fausse
      headingDegree: 0,
      timestamp: new Date(base + minute * 60_000).toISOString(),
      accuracyMeters: 5,
      ignitionOn: true,
      batteryLevelPct: 90,
      networkType: '3G',
    }));

    const trips = segmentTrips(points);
    expect(trips).toHaveLength(1);
    expect(trips[0]!.maxSpeedKmH).toBeGreaterThan(100);
  });

  it('ne transforme pas une dérive GPS à l’arrêt en vitesse de pointe', () => {
    // Un véhicule immobile dont la position oscille de quelques mètres ne doit
    // pas se voir attribuer une pointe fantôme.
    const base = Date.parse('2026-08-06T06:00:00.000Z');
    const points: GpsPoint[] = [0, 1, 2, 3].map(minute => ({
      latitude: 6.37 + (minute % 2) * 0.0002, // ~22 m d'oscillation
      longitude: 2.42,
      speedKmH: 0,
      headingDegree: 0,
      timestamp: new Date(base + minute * 60_000).toISOString(),
      accuracyMeters: 15,
      ignitionOn: true,
      batteryLevelPct: 90,
      networkType: '3G',
    }));

    // Déplacement négligeable : aucun trajet, donc aucune pointe inventée.
    expect(segmentTrips(points)).toHaveLength(0);
  });

  it('ne renvoie rien pour une trace vide ou unique', () => {
    expect(segmentTrips([])).toHaveLength(0);
    expect(segmentTrips([pointAt(0, 70)])).toHaveLength(0);
  });
});
