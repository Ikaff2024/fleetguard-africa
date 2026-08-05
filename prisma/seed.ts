/**
 * Peuplement de la base de développement.
 *
 * Reprend le jeu de démonstration de `src/data/mock-data.ts` — celui qui sert
 * déjà aux présentations commerciales — et le convertit en véritables lignes
 * PostgreSQL. Les démonstrations restent donc identiques après la bascule.
 *
 * Idempotent : relançable sans dupliquer. Les identifiants du jeu de
 * démonstration (`org_transafrik_cotonou`…) ne sont pas des UUID ; ils sont
 * transformés en UUID déterministes afin qu'une relance retombe sur les mêmes
 * lignes, et que les liens entre entités restent valides.
 *
 * Usage : npm run db:seed
 */
import { createHash } from 'node:crypto';
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
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
} from '../src/data/mock-data.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL est absent. Lancez `npm run infra:up`, puis copiez .env.example vers .env.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * UUID v5-like déterministe : la même chaîne d'entrée donne toujours le même
 * UUID. C'est ce qui rend le seed rejouable sans casser les relations.
 */
function stableUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    // Version 4 et variant RFC 4122 : l'UUID reste conforme au type PostgreSQL.
    `4${hash.slice(13, 16)}`,
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

const toDate = (value: string) => new Date(value);

/** Le domaine utilise '4G'/'3G'/'2G' ; l'enum SQL n'accepte pas d'initiale numérique. */
const NETWORK_MAP = { '4G': 'FOURG', '3G': 'THREEG', '2G': 'TWOG', NONE: 'NONE' } as const;

async function main() {
  console.log('Peuplement de la base de démonstration…\n');

  // --- Organisations -------------------------------------------------------
  for (const org of MOCK_ORGANIZATIONS) {
    const id = stableUuid(org.id);
    await prisma.organization.upsert({
      where: { id },
      update: { name: org.name, country: org.country, maxVehicles: org.maxVehicles },
      create: {
        id,
        name: org.name,
        code: org.code,
        country: org.country,
        currency: org.currency,
        timezone: org.timezone,
        maxVehicles: org.maxVehicles,
        contactEmail: org.contactEmail,
        contactPhone: org.contactPhone,
        createdAt: toDate(org.createdAt),
      },
    });
  }
  console.log(`  ${MOCK_ORGANIZATIONS.length} organisations`);

  // --- Configuration de scoring -------------------------------------------
  // Une configuration active par organisation : sans elle, aucun score ne peut
  // être calculé ni justifié.
  for (const org of MOCK_ORGANIZATIONS) {
    const orgId = stableUuid(org.id);
    const configId = stableUuid(`${org.id}:score-config:1`);
    await prisma.driverScoreConfig.upsert({
      where: { id: configId },
      update: {},
      create: {
        id: configId,
        organizationId: orgId,
        version: 1,
        overspeedWeight: MOCK_SCORE_CONFIG.weights.overspeedWeight,
        harshBrakingWeight: MOCK_SCORE_CONFIG.weights.harshBrakingWeight,
        rapidAccelWeight: MOCK_SCORE_CONFIG.weights.rapidAccelWeight,
        fatigueNightWeight: MOCK_SCORE_CONFIG.weights.fatigueNightWeight,
        geofenceBreachWeight: MOCK_SCORE_CONFIG.weights.geofenceBreachWeight,
        normalizationDistanceKm: MOCK_SCORE_CONFIG.normalizationDistanceKm,
        isActive: true,
      },
    });
  }
  console.log(`  ${MOCK_ORGANIZATIONS.length} configurations de scoring`);

  // --- Véhicules -----------------------------------------------------------
  for (const vehicle of MOCK_VEHICLES) {
    const id = stableUuid(vehicle.id);
    await prisma.vehicle.upsert({
      where: { id },
      update: { currentOdometerKm: vehicle.currentOdometerKm, status: vehicle.status },
      create: {
        id,
        organizationId: stableUuid(vehicle.organizationId),
        immatriculation: vehicle.immatriculation,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        type: vehicle.type,
        fuelType: vehicle.fuelType,
        tankCapacityLiters: vehicle.tankCapacityLiters,
        expectedConsumptionL100km: vehicle.expectedConsumptionL100km,
        currentOdometerKm: vehicle.currentOdometerKm,
        status: vehicle.status,
        speedGovernorId: vehicle.speedGovernorId,
        gpsTrackerImei: vehicle.gpsTrackerImei,
        lastServiceDate: vehicle.lastServiceDate ? toDate(vehicle.lastServiceDate) : null,
        nextServiceKm: vehicle.nextServiceKm,
        createdAt: toDate(vehicle.createdAt),
      },
    });
  }
  console.log(`  ${MOCK_VEHICLES.length} véhicules`);

  // --- Chauffeurs ----------------------------------------------------------
  for (const driver of MOCK_DRIVERS) {
    const id = stableUuid(driver.id);
    await prisma.driver.upsert({
      where: { id },
      update: { currentSafetyScore: driver.currentSafetyScore, status: driver.status },
      create: {
        id,
        organizationId: stableUuid(driver.organizationId),
        fullName: driver.fullName,
        phone: driver.phone,
        licenseNumber: driver.licenseNumber,
        licenseCategory: driver.licenseCategory,
        licenseExpiryDate: toDate(driver.licenseExpiryDate),
        assignedVehicleId: driver.assignedVehicleId ? stableUuid(driver.assignedVehicleId) : null,
        currentSafetyScore: driver.currentSafetyScore,
        totalKmDriven: driver.totalKmDriven,
        status: driver.status,
        createdAt: toDate(driver.createdAt),
      },
    });
  }
  console.log(`  ${MOCK_DRIVERS.length} chauffeurs`);

  // --- Geofences -----------------------------------------------------------
  // La géométrie PostGIS est dérivée par trigger (voir 002_postgis_and_partitions.sql).
  for (const fence of MOCK_GEOFENCES) {
    const id = stableUuid(fence.id);
    await prisma.geofence.upsert({
      where: { id },
      update: { isActive: fence.isActive ?? true },
      create: {
        id,
        organizationId: stableUuid(fence.organizationId),
        name: fence.name,
        type: fence.type,
        centerLat: fence.centerLat,
        centerLng: fence.centerLng,
        radiusMeters: fence.radiusMeters,
        speedLimitKmH: fence.speedLimitKmH,
        maxDwellTimeMinutes: fence.maxDwellTimeMinutes,
        notifyOnEntry: fence.notifyOnEntry ?? false,
        notifyOnExit: fence.notifyOnExit ?? false,
        notifyOnSpeeding: fence.notifyOnSpeeding ?? false,
        notifyOnProlongedStay: fence.notifyOnProlongedStay ?? false,
        notificationChannels: fence.notificationChannels ?? [],
        assignedVehicleIds: (fence.assignedVehicleIds ?? []).map(stableUuid),
        severity: fence.severity ?? 'MEDIUM',
        isActive: fence.isActive ?? true,
        createdAt: toDate(fence.createdAt),
      },
    });
  }
  console.log(`  ${MOCK_GEOFENCES.length} geofences`);

  // --- Événements de sécurité ---------------------------------------------
  for (const event of MOCK_SAFETY_EVENTS) {
    const id = stableUuid(event.id);
    await prisma.safetyEvent.upsert({
      where: { id },
      update: {},
      create: {
        id,
        organizationId: stableUuid(event.organizationId),
        vehicleId: stableUuid(event.vehicleId),
        driverId: stableUuid(event.driverId),
        eventType: event.eventType,
        severity: event.severity,
        recordedAt: toDate(event.recordedAt),
        latitude: event.latitude,
        longitude: event.longitude,
        speedKmH: event.speedKmH,
        speedLimitKmH: event.speedLimitKmH,
        durationSeconds: event.durationSeconds,
        description: event.description,
        penaltyPointsDeducted: event.penaltyPointsDeducted,
      },
    });
  }
  console.log(`  ${MOCK_SAFETY_EVENTS.length} événements de sécurité`);

  // --- Maintenance ---------------------------------------------------------
  for (const log of MOCK_MAINTENANCE_LOGS) {
    const id = stableUuid(log.id);
    await prisma.maintenanceLog.upsert({
      where: { id },
      update: { status: log.status },
      create: {
        id,
        organizationId: stableUuid(log.organizationId),
        vehicleId: stableUuid(log.vehicleId),
        type: log.type,
        description: log.description,
        odometerKmAtService: log.odometerKmAtService,
        cost: log.cost,
        currency: log.currency,
        serviceProvider: log.serviceProvider,
        technicianName: log.technicianName,
        technicianNotes: log.technicianNotes,
        performedAt: toDate(log.performedAt),
        nextServiceKmDue: log.nextServiceKmDue,
        status: log.status,
        partsReplaced: log.partsReplaced ?? undefined,
      },
    });
  }
  console.log(`  ${MOCK_MAINTENANCE_LOGS.length} interventions de maintenance`);

  // --- Carburant -----------------------------------------------------------
  for (const log of MOCK_FUEL_LOGS) {
    const id = stableUuid(log.id);
    await prisma.fuelLog.upsert({
      where: { id },
      update: { suspectedFuelTheft: log.suspectedFuelTheft },
      create: {
        id,
        organizationId: stableUuid(log.organizationId),
        vehicleId: stableUuid(log.vehicleId),
        driverId: log.driverId ? stableUuid(log.driverId) : null,
        litersAdded: log.litersAdded,
        totalCost: log.totalCost,
        pricePerLiter: log.pricePerLiter,
        currency: log.currency,
        odometerKm: log.odometerKm,
        stationName: log.stationName,
        receiptNumber: log.receiptNumber,
        calculatedL100km: log.calculatedL100km,
        suspectedFuelTheft: log.suspectedFuelTheft,
        loggedAt: toDate(log.loggedAt),
      },
    });
  }
  console.log(`  ${MOCK_FUEL_LOGS.length} pleins de carburant`);

  // --- Conformité ----------------------------------------------------------
  for (const doc of MOCK_COMPLIANCE_DOCS) {
    const id = stableUuid(doc.id);
    await prisma.complianceDoc.upsert({
      where: { id },
      update: { status: doc.status },
      create: {
        id,
        organizationId: stableUuid(doc.organizationId),
        vehicleId: doc.vehicleId ? stableUuid(doc.vehicleId) : null,
        driverId: doc.driverId ? stableUuid(doc.driverId) : null,
        title: doc.title,
        docType: doc.docType,
        docNumber: doc.docNumber,
        issuedDate: toDate(doc.issuedDate),
        expiryDate: toDate(doc.expiryDate),
        status: doc.status,
        fileUrl: doc.fileUrl,
      },
    });
  }
  console.log(`  ${MOCK_COMPLIANCE_DOCS.length} documents de conformité`);

  console.log('\nPeuplement terminé.');
  console.log(`Réseau (référence enum) : ${Object.values(NETWORK_MAP).join(', ')}`);
}

main()
  .catch(err => {
    console.error('Échec du peuplement :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
