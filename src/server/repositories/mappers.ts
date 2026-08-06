import type { Prisma } from '../../generated/prisma/client.js';
import type {
  ComplianceDoc,
  Driver,
  Geofence,
  FuelLog,
  MaintenanceLog,
  Organization,
  SafetyEvent,
  Vehicle,
} from '../../types';

/**
 * Conversion des entités PostgreSQL vers les types du domaine.
 *
 * Deux écarts systématiques imposent cette couche :
 *   - les montants et mesures sont des `Decimal` en base (aucune approximation
 *     binaire sur un prix), là où l'interface manipule des nombres ;
 *   - les dates sont des objets `Date`, là où le contrat d'API expose des
 *     chaînes ISO.
 *
 * Sans ces conversions, le front recevrait `{"s":1,"e":2,"d":[34]}` à la place
 * de `34.0` — une panne d'affichage silencieuse et difficile à diagnostiquer.
 */

type DecimalLike = Prisma.Decimal | number | null | undefined;

/** Decimal → number. */
export function toNumber(value: DecimalLike): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value.toString());
}

/** Decimal optionnel → number | undefined (pour distinguer « zéro » de « non mesuré »). */
export function toOptionalNumber(value: DecimalLike): number | undefined {
  if (value === null || value === undefined) return undefined;
  return toNumber(value);
}

export function toIso(value: Date | null | undefined): string {
  return (value ?? new Date()).toISOString();
}

export function toOptionalIso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

/** Date seule (échéances, jours de service) : la partie horaire n'a pas de sens. */
export function toDateOnly(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

export function mapOrganization(row: {
  id: string;
  name: string;
  code: string;
  country: string;
  currency: string;
  timezone: string;
  logoUrl: string | null;
  maxVehicles: number;
  contactEmail: string;
  contactPhone: string;
  createdAt: Date;
}): Organization {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    country: row.country,
    currency: row.currency as Organization['currency'],
    timezone: row.timezone as Organization['timezone'],
    logoUrl: row.logoUrl ?? undefined,
    maxVehicles: row.maxVehicles,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    createdAt: toIso(row.createdAt),
  };
}

export function mapVehicle(row: {
  id: string;
  organizationId: string;
  immatriculation: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  type: string;
  fuelType: string;
  tankCapacityLiters: Prisma.Decimal;
  expectedConsumptionL100km: Prisma.Decimal;
  currentOdometerKm: number;
  status: string;
  speedGovernorId: string | null;
  gpsTrackerImei: string | null;
  lastServiceDate: Date | null;
  nextServiceKm: number | null;
  createdAt: Date;
}): Vehicle {
  return {
    id: row.id,
    organizationId: row.organizationId,
    immatriculation: row.immatriculation,
    vin: row.vin,
    make: row.make,
    model: row.model,
    year: row.year,
    type: row.type as Vehicle['type'],
    fuelType: row.fuelType as Vehicle['fuelType'],
    tankCapacityLiters: toNumber(row.tankCapacityLiters),
    expectedConsumptionL100km: toNumber(row.expectedConsumptionL100km),
    currentOdometerKm: row.currentOdometerKm,
    status: row.status as Vehicle['status'],
    speedGovernorId: row.speedGovernorId ?? undefined,
    gpsTrackerImei: row.gpsTrackerImei ?? undefined,
    lastServiceDate: row.lastServiceDate ? toDateOnly(row.lastServiceDate) : undefined,
    nextServiceKm: row.nextServiceKm ?? undefined,
    createdAt: toIso(row.createdAt),
  };
}

export function mapDriver(row: {
  id: string;
  organizationId: string;
  userId: string | null;
  fullName: string;
  phone: string;
  licenseNumber: string;
  licenseCategory: string;
  licenseExpiryDate: Date;
  assignedVehicleId: string | null;
  currentSafetyScore: Prisma.Decimal;
  totalKmDriven: number;
  status: string;
  avatarUrl: string | null;
  createdAt: Date;
}): Driver {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId ?? undefined,
    fullName: row.fullName,
    phone: row.phone,
    licenseNumber: row.licenseNumber,
    licenseCategory: row.licenseCategory,
    licenseExpiryDate: toDateOnly(row.licenseExpiryDate),
    assignedVehicleId: row.assignedVehicleId ?? undefined,
    currentSafetyScore: toNumber(row.currentSafetyScore),
    totalKmDriven: row.totalKmDriven,
    status: row.status as Driver['status'],
    avatarUrl: row.avatarUrl ?? undefined,
    createdAt: toIso(row.createdAt),
  };
}

export function mapSafetyEvent(row: {
  id: string;
  organizationId: string;
  vehicleId: string;
  driverId: string;
  eventType: string;
  severity: string;
  recordedAt: Date;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  speedKmH: Prisma.Decimal;
  speedLimitKmH: Prisma.Decimal | null;
  durationSeconds: number | null;
  description: string;
  penaltyPointsDeducted: Prisma.Decimal;
}): SafetyEvent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    driverId: row.driverId,
    eventType: row.eventType as SafetyEvent['eventType'],
    severity: row.severity as SafetyEvent['severity'],
    recordedAt: toIso(row.recordedAt),
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    speedKmH: toNumber(row.speedKmH),
    speedLimitKmH: toOptionalNumber(row.speedLimitKmH),
    durationSeconds: row.durationSeconds ?? undefined,
    description: row.description,
    penaltyPointsDeducted: toNumber(row.penaltyPointsDeducted),
  };
}

export function mapMaintenanceLog(row: {
  id: string;
  organizationId: string;
  vehicleId: string;
  type: string;
  description: string;
  odometerKmAtService: number;
  cost: Prisma.Decimal;
  currency: string;
  serviceProvider: string;
  technicianName: string | null;
  technicianNotes: string | null;
  performedAt: Date;
  nextServiceKmDue: number | null;
  status: string;
  partsReplaced: Prisma.JsonValue;
}): MaintenanceLog {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    type: row.type as MaintenanceLog['type'],
    description: row.description,
    odometerKmAtService: row.odometerKmAtService,
    cost: toNumber(row.cost),
    currency: row.currency as MaintenanceLog['currency'],
    serviceProvider: row.serviceProvider,
    technicianName: row.technicianName ?? undefined,
    technicianNotes: row.technicianNotes ?? undefined,
    performedAt: toDateOnly(row.performedAt),
    nextServiceKmDue: row.nextServiceKmDue ?? undefined,
    status: row.status as MaintenanceLog['status'],
    partsReplaced: (row.partsReplaced as MaintenanceLog['partsReplaced']) ?? undefined,
  };
}

export function mapFuelLog(row: {
  id: string;
  organizationId: string;
  vehicleId: string;
  driverId: string | null;
  litersAdded: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  pricePerLiter: Prisma.Decimal;
  currency: string;
  odometerKm: number;
  stationName: string;
  receiptNumber: string | null;
  calculatedL100km: Prisma.Decimal | null;
  suspectedFuelTheft: boolean;
  loggedAt: Date;
}): FuelLog {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    driverId: row.driverId ?? '',
    litersAdded: toNumber(row.litersAdded),
    totalCost: toNumber(row.totalCost),
    pricePerLiter: toNumber(row.pricePerLiter),
    currency: row.currency as FuelLog['currency'],
    odometerKm: row.odometerKm,
    stationName: row.stationName,
    receiptNumber: row.receiptNumber ?? '',
    calculatedL100km: toOptionalNumber(row.calculatedL100km),
    suspectedFuelTheft: row.suspectedFuelTheft,
    loggedAt: toIso(row.loggedAt),
  };
}

export function mapComplianceDoc(row: {
  id: string;
  organizationId: string;
  vehicleId: string | null;
  driverId: string | null;
  title: string;
  docType: string;
  docNumber: string;
  issuedDate: Date;
  expiryDate: Date;
  status: string;
  fileUrl: string | null;
}): ComplianceDoc {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId ?? undefined,
    driverId: row.driverId ?? undefined,
    title: row.title,
    docType: row.docType as ComplianceDoc['docType'],
    docNumber: row.docNumber,
    issuedDate: toDateOnly(row.issuedDate),
    expiryDate: toDateOnly(row.expiryDate),
    status: row.status as ComplianceDoc['status'],
    fileUrl: row.fileUrl ?? undefined,
  };
}

export function mapGeofence(row: {
  id: string;
  organizationId: string;
  name: string;
  type: string;
  centerLat: Prisma.Decimal | null;
  centerLng: Prisma.Decimal | null;
  radiusMeters: number | null;
  speedLimitKmH: number | null;
  maxDwellTimeMinutes: number | null;
  notifyOnEntry: boolean;
  notifyOnExit: boolean;
  notifyOnSpeeding: boolean;
  notifyOnProlongedStay: boolean;
  notificationChannels: string[];
  assignedVehicleIds: string[];
  severity: string;
  isActive: boolean;
  createdAt: Date;
}): Geofence {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    type: row.type as Geofence['type'],
    // La géométrie PostGIS n'est pas transmise au client : l'interface trace
    // un cercle à partir du centre et du rayon, ce qui évite d'envoyer des
    // polygones de plusieurs kilo-octets sur une liaison mobile.
    geometryType: row.radiusMeters ? 'CIRCLE' : 'POLYGON',
    centerLat: toOptionalNumber(row.centerLat),
    centerLng: toOptionalNumber(row.centerLng),
    radiusMeters: row.radiusMeters ?? undefined,
    speedLimitKmH: row.speedLimitKmH ?? undefined,
    maxDwellTimeMinutes: row.maxDwellTimeMinutes ?? undefined,
    notifyOnEntry: row.notifyOnEntry,
    notifyOnExit: row.notifyOnExit,
    notifyOnSpeeding: row.notifyOnSpeeding,
    notifyOnProlongedStay: row.notifyOnProlongedStay,
    notificationChannels: row.notificationChannels as Geofence['notificationChannels'],
    assignedVehicleIds: row.assignedVehicleIds,
    severity: row.severity as Geofence['severity'],
    isActive: row.isActive,
    createdAt: toIso(row.createdAt),
  };
}
