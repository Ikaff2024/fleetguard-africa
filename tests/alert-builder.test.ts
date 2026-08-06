import { describe, expect, it } from 'vitest';
import {
  type AlertSources,
  DEFAULT_ALERT_THRESHOLDS,
  deriveAlerts,
} from '../src/server/services/alert-builder.js';

/**
 * Dérivation des alertes.
 *
 * L'enjeu est la confiance : un centre d'alertes qui signale trop finit ignoré,
 * et un qui accuse sans preuve devient indéfendable devant un chauffeur.
 */

const NOW = new Date('2026-08-06T12:00:00.000Z');

function sources(overrides: Partial<AlertSources> = {}): AlertSources {
  return {
    safetyEvents: [],
    complianceDocs: [],
    vehicles: [],
    fuelLogs: [],
    ...overrides,
  };
}

function inDays(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

describe('Dérivation des alertes', () => {
  function safetyEvent(id: string, severity: string, eventType = 'OVER_SPEED', day = 6) {
    return {
      id,
      eventType,
      severity,
      recordedAt: new Date(`2026-08-0${day}T09:00:00.000Z`),
      vehicleId: 'veh-1',
      driverId: 'drv-1',
      latitude: 6.37,
      longitude: 2.42,
      speedKmH: 96,
      speedLimitKmH: 80,
      description: 'Excès relevé sur le corridor.',
    };
  }

  it('rattache chaque alerte au fait qui la produit', () => {
    const alerts = deriveAlerts(
      sources({
        safetyEvents: [
          {
            id: 'evt-1',
            eventType: 'OVER_SPEED',
            severity: 'HIGH',
            recordedAt: new Date('2026-08-06T09:00:00.000Z'),
            vehicleId: 'veh-1',
            driverId: 'drv-1',
            latitude: 6.37,
            longitude: 2.42,
            speedKmH: 96,
            speedLimitKmH: 80,
            description: 'Excès relevé sur le corridor.',
          },
        ],
      }),
      { now: NOW },
    );

    expect(alerts).toHaveLength(1);
    // Sans source traçable, le chiffre affiché ne peut fonder aucune sanction.
    expect(alerts[0]!.sourceType).toBe('SAFETY_EVENT');
    expect(alerts[0]!.sourceId).toBe('evt-1');
    expect(alerts[0]!.metricValue).toContain('96');
    expect(alerts[0]!.metricValue).toContain('80');
  });

  it('signale un document qui approche de son échéance, pas ceux qui sont loin', () => {
    const doc = (id: string, days: number) => ({
      id,
      title: 'Carte brune CEDEAO',
      docType: 'CEDEAO_BROWN_CARD',
      docNumber: `CB-${id}`,
      expiryDate: inDays(days),
      vehicleId: 'veh-1',
    });

    const alerts = deriveAlerts(sources({ complianceDocs: [doc('proche', 10), doc('lointain', 120)] }), {
      now: NOW,
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.sourceId).toBe('proche');
  });

  it('traite un document périmé comme critique', () => {
    const alerts = deriveAlerts(
      sources({
        complianceDocs: [
          {
            id: 'doc-perime',
            title: 'Visite technique',
            docType: 'TECHNICAL_INSPECTION',
            docNumber: 'VT-9',
            expiryDate: inDays(-5),
            vehicleId: 'veh-1',
          },
        ],
      }),
      { now: NOW },
    );

    // Un camion arrêté au poste frontière coûte davantage que le renouvellement.
    expect(alerts[0]!.severity).toBe('CRITICAL');
    expect(alerts[0]!.description).toContain('5');
  });

  it('alerte sur une révision proche et sur une révision dépassée', () => {
    const alerts = deriveAlerts(
      sources({
        vehicles: [
          { id: 'veh-proche', immatriculation: 'RB-1', currentOdometerKm: 49_500, nextServiceKm: 50_000 },
          { id: 'veh-depasse', immatriculation: 'RB-2', currentOdometerKm: 52_000, nextServiceKm: 50_000 },
          { id: 'veh-loin', immatriculation: 'RB-3', currentOdometerKm: 10_000, nextServiceKm: 50_000 },
        ],
      }),
      { now: NOW },
    );

    expect(alerts).toHaveLength(2);
    expect(alerts.find(a => a.sourceId === 'veh-depasse')!.severity).toBe('HIGH');
    expect(alerts.find(a => a.sourceId === 'veh-loin')).toBeUndefined();
  });

  it('ignore un véhicule sans échéance d’entretien renseignée', () => {
    const alerts = deriveAlerts(
      sources({
        vehicles: [{ id: 'veh-1', immatriculation: 'RB-1', currentOdometerKm: 90_000 }],
      }),
      { now: NOW },
    );

    expect(alerts).toHaveLength(0);
  });

  it('signale un écart de consommation sans conclure au vol', () => {
    const alerts = deriveAlerts(
      sources({
        fuelLogs: [
          {
            id: 'plein-1',
            vehicleId: 'veh-1',
            loggedAt: new Date('2026-08-05T08:00:00.000Z'),
            stationName: 'Station Total Cotonou',
            litersAdded: 180,
            calculatedL100km: 45,
            suspectedFuelTheft: false,
            expectedConsumptionL100km: 32,
          },
        ],
      }),
      { now: NOW },
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.category).toBe('FUEL_ANOMALY');
    // Le libellé reste factuel : un écart peut venir de la charge ou de la route.
    expect(alerts[0]!.title.toLowerCase()).not.toContain('vol');
    expect(alerts[0]!.description.toLowerCase()).not.toContain('vol');
  });

  it('ne signale pas un écart de consommation dans la marge ordinaire', () => {
    const alerts = deriveAlerts(
      sources({
        fuelLogs: [
          {
            id: 'plein-normal',
            vehicleId: 'veh-1',
            loggedAt: NOW,
            stationName: 'Station Total',
            litersAdded: 150,
            // +9 % : la charge et le relief l'expliquent.
            calculatedL100km: 35,
            suspectedFuelTheft: false,
            expectedConsumptionL100km: 32,
          },
        ],
      }),
      { now: NOW },
    );

    expect(alerts).toHaveLength(0);
  });

  it('ne signale pas un écart mineur isolé', () => {
    // Un freinage brusque pèse déjà sur le score. Le remonter comme alerte
    // noierait les incidents qui appellent vraiment une décision.
    const alerts = deriveAlerts(
      sources({ safetyEvents: [safetyEvent('unique', 'MEDIUM', 'HARSH_BRAKING')] }),
      { now: NOW },
    );

    expect(alerts).toHaveLength(0);
  });

  it('signale la répétition d’écarts mineurs, regroupée par chauffeur', () => {
    const events = [1, 2, 3, 4, 5].map(i => safetyEvent(`freinage-${i}`, 'MEDIUM', 'HARSH_BRAKING', i));

    const alerts = deriveAlerts(sources({ safetyEvents: events }), { now: NOW });

    // Cinq freinages produisent une alerte, pas cinq.
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.sourceType).toBe('SAFETY_PATTERN_HARSH_BRAKING');
    expect(alerts[0]!.sourceId).toBe('drv-1');
    expect(alerts[0]!.metricValue).toContain('5');
  });

  it('signale toujours individuellement un écart grave', () => {
    const alerts = deriveAlerts(
      sources({
        safetyEvents: [
          safetyEvent('grave-1', 'CRITICAL', 'OVER_SPEED', 5),
          safetyEvent('grave-2', 'HIGH', 'OVER_SPEED', 6),
        ],
      }),
      { now: NOW },
    );

    // Une infraction caractérisée ne se dilue pas dans une statistique.
    expect(alerts).toHaveLength(2);
    expect(alerts.map(a => a.sourceType)).toEqual(['SAFETY_EVENT', 'SAFETY_EVENT']);
  });

  it('ne mélange pas les répétitions de deux chauffeurs', () => {
    const events = [
      ...[1, 2, 3].map(i => ({ ...safetyEvent(`a-${i}`, 'MEDIUM', 'HARSH_BRAKING', i) })),
      ...[1, 2, 3].map(i => ({
        ...safetyEvent(`b-${i}`, 'MEDIUM', 'HARSH_BRAKING', i),
        id: `b-${i}`,
        driverId: 'drv-2',
      })),
    ];

    const alerts = deriveAlerts(sources({ safetyEvents: events }), { now: NOW });

    expect(alerts).toHaveLength(2);
    expect(new Set(alerts.map(a => a.sourceId))).toEqual(new Set(['drv-1', 'drv-2']));
  });

  it('présente les alertes de la plus récente à la plus ancienne', () => {
    const alerts = deriveAlerts(
      sources({
        safetyEvents: [
          {
            id: 'ancien',
            eventType: 'HARSH_BRAKING',
            severity: 'HIGH',
            recordedAt: new Date('2026-08-01T09:00:00.000Z'),
            vehicleId: 'veh-1',
            driverId: 'drv-1',
            latitude: 6.37,
            longitude: 2.42,
            speedKmH: 60,
            description: 'Freinage.',
          },
          {
            id: 'recent',
            eventType: 'OVER_SPEED',
            severity: 'CRITICAL',
            recordedAt: new Date('2026-08-06T09:00:00.000Z'),
            vehicleId: 'veh-1',
            driverId: 'drv-1',
            latitude: 6.37,
            longitude: 2.42,
            speedKmH: 96,
            description: 'Excès.',
          },
        ],
      }),
      { now: NOW },
    );

    expect(alerts.map(a => a.sourceId)).toEqual(['recent', 'ancien']);
  });

  it('ne produit rien quand aucun fait ne le justifie', () => {
    expect(deriveAlerts(sources(), { now: NOW })).toHaveLength(0);
  });

  it('respecte les seuils par défaut documentés', () => {
    expect(DEFAULT_ALERT_THRESHOLDS.documentNoticeDays).toBe(30);
    expect(DEFAULT_ALERT_THRESHOLDS.serviceNoticeKm).toBe(1000);
    expect(DEFAULT_ALERT_THRESHOLDS.fuelDeviationPct).toBe(20);
    expect(DEFAULT_ALERT_THRESHOLDS.minorEventPatternCount).toBe(3);
  });
});
