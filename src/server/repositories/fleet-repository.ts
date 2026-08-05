/**
 * Couche d'accès aux données.
 *
 * Implémentation actuelle : jeu de démonstration en mémoire.
 * En Phase 1, seul le corps de ces fonctions change (requêtes Prisma) ; les
 * routes et leurs contrats restent identiques. C'est précisément l'intérêt de
 * cette indirection : la bascule vers PostgreSQL ne touche pas les routes.
 */
import {
  MOCK_COMPLIANCE_DOCS,
  MOCK_DRIVERS,
  MOCK_FUEL_LOGS,
  MOCK_MAINTENANCE_LOGS,
  MOCK_ORGANIZATIONS,
  MOCK_SAFETY_EVENTS,
  MOCK_SCORE_CONFIG,
  MOCK_VEHICLES,
} from '../../data/mock-data.js';
import type {
  ComplianceDoc,
  Driver,
  DriverScoreConfig,
  FuelLog,
  MaintenanceLog,
  Organization,
  SafetyEvent,
  Vehicle,
} from '../../types';

export function findOrganizationById(id: string): Organization | undefined {
  return MOCK_ORGANIZATIONS.find(o => o.id === id);
}

export function listOrganizations(): Organization[] {
  return MOCK_ORGANIZATIONS;
}

export function listVehicles(organizationId: string): Vehicle[] {
  return MOCK_VEHICLES.filter(v => v.organizationId === organizationId);
}

export function listDrivers(organizationId: string): Driver[] {
  return MOCK_DRIVERS.filter(d => d.organizationId === organizationId);
}

/**
 * Recherche d'un chauffeur **bornée au tenant**.
 * Toute lecture par identifiant doit être filtrée par organisation : c'est la
 * fuite inter-tenants la plus banale (identifiant deviné ou énuméré).
 */
export function findDriver(organizationId: string, driverId: string): Driver | undefined {
  return MOCK_DRIVERS.find(d => d.id === driverId && d.organizationId === organizationId);
}

export function findVehicle(organizationId: string, vehicleId: string): Vehicle | undefined {
  return MOCK_VEHICLES.find(v => v.id === vehicleId && v.organizationId === organizationId);
}

export function listSafetyEvents(organizationId: string, driverId?: string): SafetyEvent[] {
  return MOCK_SAFETY_EVENTS.filter(
    e => e.organizationId === organizationId && (!driverId || e.driverId === driverId),
  );
}

export function listMaintenanceLogs(organizationId: string): MaintenanceLog[] {
  return MOCK_MAINTENANCE_LOGS.filter(m => m.organizationId === organizationId);
}

export function listFuelLogs(organizationId: string, driverId?: string): FuelLog[] {
  return MOCK_FUEL_LOGS.filter(
    f => f.organizationId === organizationId && (!driverId || f.driverId === driverId),
  );
}

export function listComplianceDocs(organizationId: string): ComplianceDoc[] {
  return MOCK_COMPLIANCE_DOCS.filter(c => c.organizationId === organizationId);
}

export function getScoreConfig(_organizationId: string): DriverScoreConfig {
  // En Phase 1 : configuration versionnée par organisation, lue en base.
  return MOCK_SCORE_CONFIG;
}
