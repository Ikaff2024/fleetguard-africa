import { describe, expect, it } from 'vitest';
import {
  MOCK_COMPLIANCE_DOCS,
  MOCK_DRIVERS,
  MOCK_FUEL_LOGS,
  MOCK_GEOFENCES,
  MOCK_MAINTENANCE_LOGS,
  MOCK_ORGANIZATIONS,
  MOCK_SAFETY_EVENTS,
  MOCK_VEHICLES,
} from '../src/data/mock-data.js';

/**
 * Intégrité référentielle du jeu de démonstration.
 *
 * Ce jeu n'est pas décoratif : il alimente les démonstrations commerciales et
 * sert de source au peuplement de la base (prisma/seed.ts). Une référence
 * cassée passe inaperçue tant que tout vit en mémoire, puis fait échouer le
 * seed sur une violation de clé étrangère — ou pire, produit un écran vide
 * pendant une démonstration client.
 */

const orgIds = new Set(MOCK_ORGANIZATIONS.map(o => o.id));
const vehicleIds = new Set(MOCK_VEHICLES.map(v => v.id));
const driverIds = new Set(MOCK_DRIVERS.map(d => d.id));

interface Referencing {
  id: string;
  organizationId: string;
  vehicleId?: string;
  driverId?: string;
  assignedVehicleId?: string;
}

/** Retourne les références pointant vers une entité absente. */
function danglingRefs(rows: Referencing[], field: keyof Referencing, known: Set<string>): string[] {
  return rows
    .filter(row => {
      const value = row[field];
      return typeof value === 'string' && value.length > 0 && !known.has(value);
    })
    .map(row => `${row.id} → ${String(field)}="${row[field]}"`);
}

describe('Intégrité du jeu de démonstration', () => {
  it('rattache chaque entité à une organisation existante', () => {
    const collections: [string, Referencing[]][] = [
      ['véhicules', MOCK_VEHICLES],
      ['chauffeurs', MOCK_DRIVERS],
      ['geofences', MOCK_GEOFENCES],
      ['événements de sécurité', MOCK_SAFETY_EVENTS],
      ['maintenance', MOCK_MAINTENANCE_LOGS],
      ['carburant', MOCK_FUEL_LOGS],
      ['conformité', MOCK_COMPLIANCE_DOCS],
    ];

    for (const [label, rows] of collections) {
      expect(danglingRefs(rows, 'organizationId', orgIds), label).toEqual([]);
    }
  });

  it('ne référence que des véhicules existants', () => {
    expect(danglingRefs(MOCK_SAFETY_EVENTS, 'vehicleId', vehicleIds)).toEqual([]);
    expect(danglingRefs(MOCK_MAINTENANCE_LOGS, 'vehicleId', vehicleIds)).toEqual([]);
    expect(danglingRefs(MOCK_FUEL_LOGS, 'vehicleId', vehicleIds)).toEqual([]);
    expect(danglingRefs(MOCK_COMPLIANCE_DOCS, 'vehicleId', vehicleIds)).toEqual([]);
    expect(danglingRefs(MOCK_DRIVERS, 'assignedVehicleId', vehicleIds)).toEqual([]);
  });

  it('ne référence que des chauffeurs existants', () => {
    expect(danglingRefs(MOCK_SAFETY_EVENTS, 'driverId', driverIds)).toEqual([]);
    expect(danglingRefs(MOCK_FUEL_LOGS, 'driverId', driverIds)).toEqual([]);
    expect(danglingRefs(MOCK_COMPLIANCE_DOCS, 'driverId', driverIds)).toEqual([]);
  });

  it('ne fait jamais pointer une entité vers une autre organisation', () => {
    // Un enregistrement de maintenance rattaché à l'organisation A mais portant
    // sur un véhicule de l'organisation B est une fuite inter-tenants dès
    // l'instant où ces données deviennent réelles.
    const vehicleOrg = new Map(MOCK_VEHICLES.map(v => [v.id, v.organizationId]));
    const driverOrg = new Map(MOCK_DRIVERS.map(d => [d.id, d.organizationId]));

    const crossTenant: string[] = [];

    for (const row of [
      ...MOCK_SAFETY_EVENTS,
      ...MOCK_MAINTENANCE_LOGS,
      ...MOCK_FUEL_LOGS,
      ...MOCK_COMPLIANCE_DOCS,
    ] as Referencing[]) {
      if (row.vehicleId && vehicleOrg.get(row.vehicleId) !== row.organizationId) {
        crossTenant.push(`${row.id} : véhicule ${row.vehicleId} appartient à un autre tenant`);
      }
      if (row.driverId && driverOrg.get(row.driverId) !== row.organizationId) {
        crossTenant.push(`${row.id} : chauffeur ${row.driverId} appartient à un autre tenant`);
      }
    }

    expect(crossTenant).toEqual([]);
  });

  it('garantit l’unicité des identifiants', () => {
    const allIds = [
      ...MOCK_ORGANIZATIONS,
      ...MOCK_VEHICLES,
      ...MOCK_DRIVERS,
      ...MOCK_GEOFENCES,
      ...MOCK_SAFETY_EVENTS,
      ...MOCK_MAINTENANCE_LOGS,
      ...MOCK_FUEL_LOGS,
      ...MOCK_COMPLIANCE_DOCS,
    ].map(row => row.id);

    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
