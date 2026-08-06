import { describe, expect, it } from 'vitest';
import type { GpsPoint } from '../src/types';
import { detectEvents, distanceTravelledKm } from '../src/server/services/driving-events.js';

/**
 * Détection des événements de conduite.
 *
 * Ces règles décident de sanctions et de primes : elles doivent être justes
 * avant d'être exhaustives. Un excès inventé coûte plus cher qu'un excès
 * manqué — il faut le contester, l'annuler, et la confiance dans l'outil
 * s'érode durablement.
 */

const point = (overrides: Partial<GpsPoint> & { timestamp: string }): GpsPoint => ({
  latitude: 7.9124,
  longitude: 2.1092,
  speedKmH: 60,
  headingDegree: 90,
  accuracyMeters: 5,
  ignitionOn: true,
  batteryLevelPct: 90,
  networkType: '3G',
  ...overrides,
});

/** Série de points à intervalle régulier, avec vitesses imposées. */
function series(speeds: number[], startIso = '2026-08-06T10:00:00.000Z', stepSeconds = 60): GpsPoint[] {
  const start = Date.parse(startIso);
  return speeds.map((speedKmH, index) =>
    point({
      speedKmH,
      timestamp: new Date(start + index * stepSeconds * 1000).toISOString(),
      latitude: 7.9124 + index * 0.01,
    }),
  );
}

describe('Détection des excès de vitesse', () => {
  it('regroupe un dépassement continu en un seul événement', () => {
    // Quatre points au-dessus de la limite : c'est une infraction, pas quatre.
    // Compter chaque point pénaliserait le chauffeur proportionnellement à la
    // fréquence d'échantillonnage de son boîtier.
    const events = detectEvents(series([70, 95, 98, 96, 97, 65]));
    const overspeed = events.filter(e => e.eventType === 'OVER_SPEED');

    expect(overspeed).toHaveLength(1);
    expect(overspeed[0]!.speedKmH).toBe(98);
    expect(overspeed[0]!.durationSeconds).toBeGreaterThanOrEqual(180);
  });

  it('ignore un pic isolé, qui relève de l’imprécision de mesure', () => {
    // Un seul relevé à 95 km/h entre deux relevés normaux : plus probablement
    // une erreur GPS qu'un comportement.
    const events = detectEvents(series([70, 95, 70, 68], undefined, 10));
    expect(events.filter(e => e.eventType === 'OVER_SPEED')).toHaveLength(0);
  });

  it('applique une tolérance : rouler à la limite n’est pas une infraction', () => {
    const events = detectEvents(series([80, 82, 83, 80]));
    expect(events.filter(e => e.eventType === 'OVER_SPEED')).toHaveLength(0);
  });

  it('gradue la gravité selon l’ampleur du dépassement', () => {
    const modere = detectEvents(series([95, 95, 95, 95]));
    const grave = detectEvents(series([125, 125, 125, 125]));

    expect(modere.find(e => e.eventType === 'OVER_SPEED')?.severity).toBe('MEDIUM');
    expect(grave.find(e => e.eventType === 'OVER_SPEED')?.severity).toBe('CRITICAL');
  });

  it('retient la limite de la zone traversée plutôt que celle de la route', () => {
    const points = series([45, 45, 45, 45]);
    const zones = points.map(() => ({ name: 'Port de Cotonou', speedLimitKmH: 30, isRestricted: false }));

    const events = detectEvents(points, { zones });
    const overspeed = events.find(e => e.eventType === 'OVER_SPEED');

    expect(overspeed).toBeDefined();
    expect(overspeed!.speedLimitKmH).toBe(30);
    expect(overspeed!.description).toContain('Port de Cotonou');
  });
});

describe('Autres événements', () => {
  it('relève les freinages et accélérations signalés par l’appareil', () => {
    const points = [
      point({ timestamp: '2026-08-06T10:00:00.000Z', eventFlags: ['HARSH_BRAKE'] }),
      point({ timestamp: '2026-08-06T10:01:00.000Z', eventFlags: ['HARSH_ACCEL'] }),
    ];

    const events = detectEvents(points);
    expect(events.filter(e => e.eventType === 'HARSH_BRAKING')).toHaveLength(1);
    expect(events.filter(e => e.eventType === 'RAPID_ACCELERATION')).toHaveLength(1);
  });

  it('signale la présence en zone interdite', () => {
    const points = series([50, 50]);
    const zones = points.map(() => ({ name: 'Dépôt pétrolier', isRestricted: true }));

    const events = detectEvents(points, { zones });
    expect(events.filter(e => e.eventType === 'GEOFENCE_BREACH').length).toBeGreaterThan(0);
  });

  it('ne compte qu’un seul événement de conduite nocturne par lot', () => {
    // C'est la période d'exposition qui est en cause, pas chaque instant qui
    // la compose : dix points à 2 h du matin font une nuit, pas dix.
    const events = detectEvents(series([60, 60, 60, 60, 60], '2026-08-06T02:00:00.000Z'));
    expect(events.filter(e => e.eventType === 'FATIGUE_NIGHT_DRIVING')).toHaveLength(1);
  });

  it('ne signale pas la nuit un véhicule à l’arrêt', () => {
    const events = detectEvents(series([0, 0, 0], '2026-08-06T02:00:00.000Z'));
    expect(events.filter(e => e.eventType === 'FATIGUE_NIGHT_DRIVING')).toHaveLength(0);
  });

  it('ne relève rien sur une conduite normale', () => {
    const events = detectEvents(series([60, 65, 70, 68, 62], '2026-08-06T10:00:00.000Z'));
    expect(events).toHaveLength(0);
  });
});

describe('Distance parcourue', () => {
  it('additionne les segments successifs', () => {
    // Un degré de latitude vaut environ 111 km.
    const points = [
      point({ timestamp: '2026-08-06T10:00:00.000Z', latitude: 7.0 }),
      point({ timestamp: '2026-08-06T11:00:00.000Z', latitude: 7.5 }),
    ];

    const distance = distanceTravelledKm(points);
    expect(distance).toBeGreaterThan(50);
    expect(distance).toBeLessThan(60);
  });

  it('écarte les sauts de position impossibles', () => {
    // 10 degrés en une seconde : une dérive GPS, pas un déplacement. La
    // compter créditerait un kilométrage fantôme, qui fausserait à la fois le
    // score et les échéances de maintenance.
    const points = [
      point({ timestamp: '2026-08-06T10:00:00.000Z', latitude: 7.0 }),
      point({ timestamp: '2026-08-06T10:00:01.000Z', latitude: 17.0 }),
    ];

    expect(distanceTravelledKm(points)).toBe(0);
  });

  it('renvoie zéro pour un véhicule immobile', () => {
    expect(distanceTravelledKm(series([0, 0, 0]).map(p => ({ ...p, latitude: 7.9124 })))).toBe(0);
  });
});
