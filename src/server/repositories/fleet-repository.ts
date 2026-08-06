/**
 * Couche d'accès aux données.
 *
 * Deux implémentations derrière une seule interface :
 *   - PostgreSQL via Prisma dès que `DATABASE_URL` est renseignée ;
 *   - jeu de démonstration en mémoire sinon.
 *
 * Ce repli n'est pas un raccourci : il permet de démarrer le projet sans
 * infrastructure et de faire tourner les tests sans base. En production, la
 * configuration exige `DATABASE_URL` (voir env.ts), le repli y est donc
 * inatteignable.
 *
 * Toutes les lectures sont bornées à une organisation. Avec PostgreSQL, cette
 * borne est doublée par le Row-Level Security : même une requête sans filtre ne
 * renverrait rien.
 */
import {
  MOCK_COMPLIANCE_DOCS,
  MOCK_DRIVERS,
  MOCK_FUEL_LOGS,
  MOCK_GEOFENCES,
  MOCK_MAINTENANCE_LOGS,
  MOCK_ORGANIZATIONS,
  MOCK_SAFETY_EVENTS,
  MOCK_SCORE_CONFIG,
  MOCK_VEHICLES,
} from '../../data/mock-data.js';
import type {
  ComplianceDoc,
  Driver,
  Geofence,
  DriverScoreConfig,
  FuelLog,
  MaintenanceLog,
  Organization,
  SafetyEvent,
  Vehicle,
} from '../../types';
import { db, isDatabaseEnabled, withTenant } from '../db/prisma.js';
import {
  mapComplianceDoc,
  mapDriver,
  mapFuelLog,
  mapGeofence,
  mapMaintenanceLog,
  mapOrganization,
  mapSafetyEvent,
  mapVehicle,
  toNumber,
} from './mappers.js';

export async function findOrganizationById(id: string): Promise<Organization | undefined> {
  if (!isDatabaseEnabled()) {
    return MOCK_ORGANIZATIONS.find(o => o.id === id);
  }

  // Lecture hors `withTenant` : c'est la requête qui établit le contexte.
  const row = await db().organization.findFirst({
    where: { id, isActive: true, deletedAt: null },
  });
  return row ? mapOrganization(row) : undefined;
}

export async function listVehicles(organizationId: string): Promise<Vehicle[]> {
  if (!isDatabaseEnabled()) {
    return MOCK_VEHICLES.filter(v => v.organizationId === organizationId);
  }

  return withTenant(organizationId, async tx => {
    const rows = await tx.vehicle.findMany({
      where: { deletedAt: null },
      orderBy: { immatriculation: 'asc' },
    });
    return rows.map(mapVehicle);
  });
}

export async function findVehicle(organizationId: string, vehicleId: string): Promise<Vehicle | undefined> {
  if (!isDatabaseEnabled()) {
    return MOCK_VEHICLES.find(v => v.id === vehicleId && v.organizationId === organizationId);
  }

  return withTenant(organizationId, async tx => {
    const row = await tx.vehicle.findFirst({ where: { id: vehicleId, deletedAt: null } });
    return row ? mapVehicle(row) : undefined;
  });
}

export async function listDrivers(organizationId: string): Promise<Driver[]> {
  if (!isDatabaseEnabled()) {
    return MOCK_DRIVERS.filter(d => d.organizationId === organizationId);
  }

  return withTenant(organizationId, async tx => {
    const rows = await tx.driver.findMany({
      where: { deletedAt: null },
      orderBy: { fullName: 'asc' },
    });
    return rows.map(mapDriver);
  });
}

/**
 * Recherche d'un chauffeur **bornée au tenant**.
 * Une lecture par identifiant non filtrée est la fuite inter-tenants la plus
 * banale : il suffit de deviner ou d'énumérer un identifiant.
 */
export async function findDriver(organizationId: string, driverId: string): Promise<Driver | undefined> {
  if (!isDatabaseEnabled()) {
    return MOCK_DRIVERS.find(d => d.id === driverId && d.organizationId === organizationId);
  }

  return withTenant(organizationId, async tx => {
    const row = await tx.driver.findFirst({ where: { id: driverId, deletedAt: null } });
    return row ? mapDriver(row) : undefined;
  });
}

export async function listSafetyEvents(organizationId: string, driverId?: string): Promise<SafetyEvent[]> {
  if (!isDatabaseEnabled()) {
    return MOCK_SAFETY_EVENTS.filter(
      e => e.organizationId === organizationId && (!driverId || e.driverId === driverId),
    );
  }

  return withTenant(organizationId, async tx => {
    const rows = await tx.safetyEvent.findMany({
      where: driverId ? { driverId } : undefined,
      orderBy: { recordedAt: 'desc' },
      take: 500,
    });
    return rows.map(mapSafetyEvent);
  });
}

export async function listMaintenanceLogs(organizationId: string): Promise<MaintenanceLog[]> {
  if (!isDatabaseEnabled()) {
    return MOCK_MAINTENANCE_LOGS.filter(m => m.organizationId === organizationId);
  }

  return withTenant(organizationId, async tx => {
    const rows = await tx.maintenanceLog.findMany({ orderBy: { performedAt: 'desc' }, take: 500 });
    return rows.map(mapMaintenanceLog);
  });
}

export async function listFuelLogs(organizationId: string, driverId?: string): Promise<FuelLog[]> {
  if (!isDatabaseEnabled()) {
    return MOCK_FUEL_LOGS.filter(
      f => f.organizationId === organizationId && (!driverId || f.driverId === driverId),
    );
  }

  return withTenant(organizationId, async tx => {
    const rows = await tx.fuelLog.findMany({
      where: driverId ? { driverId } : undefined,
      orderBy: { loggedAt: 'desc' },
      take: 500,
    });
    return rows.map(mapFuelLog);
  });
}

export async function listGeofences(organizationId: string): Promise<Geofence[]> {
  if (!isDatabaseEnabled()) {
    return MOCK_GEOFENCES.filter(g => g.organizationId === organizationId);
  }

  return withTenant(organizationId, async tx => {
    const rows = await tx.geofence.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return rows.map(mapGeofence);
  });
}

export async function listComplianceDocs(organizationId: string): Promise<ComplianceDoc[]> {
  if (!isDatabaseEnabled()) {
    return MOCK_COMPLIANCE_DOCS.filter(c => c.organizationId === organizationId);
  }

  return withTenant(organizationId, async tx => {
    const rows = await tx.complianceDoc.findMany({
      where: { deletedAt: null },
      orderBy: { expiryDate: 'asc' },
    });
    return rows.map(mapComplianceDoc);
  });
}

/**
 * Configuration active du score.
 * Versionnée : un score recalculé plus tard avec d'autres pondérations ne
 * serait pas défendable devant un chauffeur.
 */
export async function getScoreConfig(organizationId: string): Promise<DriverScoreConfig> {
  if (!isDatabaseEnabled()) {
    return MOCK_SCORE_CONFIG;
  }

  return withTenant(organizationId, async tx => {
    const row = await tx.driverScoreConfig.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
    });

    if (!row) return MOCK_SCORE_CONFIG;

    return {
      id: row.id,
      organizationId: row.organizationId,
      version: row.version,
      weights: {
        overspeedWeight: toNumber(row.overspeedWeight),
        harshBrakingWeight: toNumber(row.harshBrakingWeight),
        rapidAccelWeight: toNumber(row.rapidAccelWeight),
        fatigueNightWeight: toNumber(row.fatigueNightWeight),
        geofenceBreachWeight: toNumber(row.geofenceBreachWeight),
      },
      normalizationDistanceKm: row.normalizationDistanceKm,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
