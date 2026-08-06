import type { GpsPoint } from '../../types';
import { isDatabaseEnabled, withTenant } from '../db/prisma.js';
import { logger } from '../logger.js';
import {
  type DetectedEvent,
  type ZoneContext,
  detectEvents,
  distanceTravelledKm,
} from '../services/driving-events.js';
import { type BuiltTrip, segmentTrips } from '../services/trip-builder.js';
import { mapSafetyEvent, toNumber } from './mappers.js';

/**
 * Persistance de la télémétrie.
 *
 * L'idempotence repose sur une contrainte d'unicité en base
 * (`organizationId, batchId`) et non sur la mémoire du processus : un boîtier
 * qui rejoue son lot après un redéploiement, ou qui atteint une autre instance
 * du service, ne doit pas voir ses infractions comptées deux fois.
 */

export interface IngestionResult {
  duplicate: boolean;
  batchId: string;
  processedPoints: number;
  distanceKm: number;
  detectedEvents: number;
  firstSeenAt: string;
}

const NETWORK_TO_ENUM = {
  '4G': 'FOURG',
  '3G': 'THREEG',
  '2G': 'TWOG',
  NONE: 'NONE',
} as const;

/**
 * Zones applicables à une série de points.
 *
 * Le test d'appartenance est délégué à PostGIS : `ST_Contains` sur index
 * spatial reste efficace là où une boucle applicative sur chaque zone et
 * chaque point s'effondrerait dès quelques milliers de points.
 */
async function resolveZones(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  points: GpsPoint[],
): Promise<(ZoneContext | null)[]> {
  const rows = await tx.$queryRaw<
    { idx: number; name: string; speedLimitKmH: number | null; type: string }[]
  >`
    SELECT p.idx,
           g.name,
           g."speedLimitKmH",
           g.type::text AS type
    FROM unnest(
           ${points.map(pt => pt.longitude)}::float8[],
           ${points.map(pt => pt.latitude)}::float8[]
         ) WITH ORDINALITY AS p(lng, lat, idx)
    JOIN geofences g
      ON g."isActive" = true
     AND g."deletedAt" IS NULL
     AND g.area IS NOT NULL
     AND ST_Contains(
           g.area::geometry,
           ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)
         )
  `;

  const zones: (ZoneContext | null)[] = points.map(() => null);
  for (const row of rows) {
    // `WITH ORDINALITY` est indexé à partir de 1.
    const index = Number(row.idx) - 1;
    if (index < 0 || index >= zones.length) continue;
    zones[index] = {
      name: row.name,
      speedLimitKmH: row.speedLimitKmH ?? undefined,
      isRestricted: row.type === 'RESTRICTED_ZONE',
    };
  }

  return zones;
}

export async function ingestTelemetryBatch(input: {
  organizationId: string;
  batchId: string;
  vehicleId: string;
  driverId: string;
  deviceId?: string;
  sentAt?: string;
  points: GpsPoint[];
}): Promise<IngestionResult> {
  const { organizationId, batchId, vehicleId, driverId, points } = input;

  return withTenant(organizationId, async tx => {
    // Rejeu : la contrainte d'unicité fait foi, y compris entre instances.
    const existing = await tx.telemetryBatch.findFirst({ where: { batchId } });
    if (existing) {
      return {
        duplicate: true,
        batchId,
        processedPoints: existing.pointCount,
        distanceKm: 0,
        detectedEvents: 0,
        firstSeenAt: existing.receivedAt.toISOString(),
      };
    }

    const batch = await tx.telemetryBatch.create({
      data: {
        organizationId,
        batchId,
        deviceId: input.deviceId,
        vehicleId,
        driverId,
        pointCount: points.length,
        sentAt: input.sentAt ? new Date(input.sentAt) : null,
      },
    });

    await tx.gpsPoint.createMany({
      data: points.map(point => ({
        organizationId,
        vehicleId,
        driverId,
        recordedAt: new Date(point.timestamp),
        latitude: point.latitude,
        longitude: point.longitude,
        altitude: point.altitude,
        speedKmH: point.speedKmH,
        headingDegree: Math.round(point.headingDegree),
        accuracyMeters: point.accuracyMeters,
        ignitionOn: point.ignitionOn,
        batteryLevelPct: Math.round(point.batteryLevelPct),
        networkType: NETWORK_TO_ENUM[point.networkType],
        eventFlags: point.eventFlags ?? [],
      })),
    });

    // Les zones ne sont interrogées qu'une fois pour tout le lot.
    let zones: (ZoneContext | null)[] = points.map(() => null);
    try {
      zones = await resolveZones(tx, points);
    } catch (err) {
      // Un échec du moteur géographique ne doit pas faire perdre les points :
      // ils sont déjà écrits, la détection se poursuit sans contexte de zone.
      logger.error({ err, batchId }, 'Résolution des zones impossible — détection sans geofence');
    }

    const detected = detectEvents(points, { zones });
    const distanceKm = distanceTravelledKm(points);

    if (detected.length > 0) {
      await tx.safetyEvent.createMany({
        data: detected.map((event: DetectedEvent) => ({
          organizationId,
          vehicleId,
          driverId,
          eventType: event.eventType,
          severity: event.severity,
          recordedAt: new Date(event.recordedAt),
          latitude: event.latitude,
          longitude: event.longitude,
          speedKmH: event.speedKmH,
          speedLimitKmH: event.speedLimitKmH,
          durationSeconds: event.durationSeconds,
          description: event.description,
          penaltyPointsDeducted: event.penaltyPointsDeducted,
        })),
      });
    }

    // L'odomètre suit la distance réellement parcourue : c'est lui qui
    // déclenche les échéances de maintenance et sert de base au calcul de
    // consommation.
    if (distanceKm > 0) {
      await tx.vehicle.updateMany({
        where: { id: vehicleId },
        data: { currentOdometerKm: { increment: Math.round(distanceKm) } },
      });
      await tx.driver.updateMany({
        where: { id: driverId },
        data: { totalKmDriven: { increment: Math.round(distanceKm) } },
      });
    }

    // Les trajets sont reconstruits sur une fenêtre glissante, pas seulement
    // sur le lot reçu : un trajet commencé dans un lot précédent doit être
    // prolongé, pas dupliqué.
    await rebuildTrips(tx, organizationId, vehicleId, driverId);

    await tx.telemetryBatch.update({
      where: { id: batch.id },
      data: { processedAt: new Date() },
    });

    return {
      duplicate: false,
      batchId,
      processedPoints: points.length,
      distanceKm,
      detectedEvents: detected.length,
      firstSeenAt: batch.receivedAt.toISOString(),
    };
  });
}

/**
 * Reconstruit les trajets récents d'un véhicule.
 *
 * L'opération est rejouable : un même départ ne produit qu'un trajet, quel que
 * soit le nombre de fois où la trace est réanalysée. C'est la contrainte
 * d'unicité `(vehicleId, startedAt)` qui l'assure.
 */
async function rebuildTrips(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  organizationId: string,
  vehicleId: string,
  driverId: string,
): Promise<number> {
  // Fenêtre de 48 h : assez large pour rattacher un trajet entamé la veille,
  // assez étroite pour ne pas relire tout l'historique à chaque lot.
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const rows = await tx.gpsPoint.findMany({
    where: { vehicleId, recordedAt: { gte: since } },
    orderBy: { recordedAt: 'asc' },
    take: 5000,
  });

  if (rows.length < 2) return 0;

  const points: GpsPoint[] = rows.map(row => ({
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    speedKmH: toNumber(row.speedKmH),
    headingDegree: row.headingDegree,
    timestamp: row.recordedAt.toISOString(),
    accuracyMeters: toNumber(row.accuracyMeters),
    ignitionOn: row.ignitionOn,
    batteryLevelPct: row.batteryLevelPct,
    networkType: '3G',
  }));

  const trips = segmentTrips(points);

  for (const trip of trips) {
    await tx.trip.upsert({
      where: { vehicleId_startedAt: { vehicleId, startedAt: new Date(trip.startedAt) } },
      update: tripData(trip),
      create: { organizationId, vehicleId, driverId, ...tripData(trip), startedAt: new Date(trip.startedAt) },
    });
  }

  return trips.length;
}

function tripData(trip: BuiltTrip) {
  return {
    endedAt: new Date(trip.endedAt),
    distanceKm: trip.distanceKm,
    durationSeconds: trip.durationSeconds,
    stopCount: trip.stopCount,
    stopSeconds: trip.stopSeconds,
    maxSpeedKmH: trip.maxSpeedKmH,
    avgSpeedKmH: trip.avgSpeedKmH,
    startLatitude: trip.startLatitude,
    startLongitude: trip.startLongitude,
    endLatitude: trip.endLatitude,
    endLongitude: trip.endLongitude,
    pointCount: trip.pointCount,
  };
}

/** Trajets récents, du plus récent au plus ancien. */
export async function listTrips(
  organizationId: string,
  filters: { vehicleId?: string; driverId?: string; limit?: number } = {},
) {
  if (!isDatabaseEnabled()) return [];

  return withTenant(organizationId, async tx => {
    const rows = await tx.trip.findMany({
      where: {
        ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
        ...(filters.driverId ? { driverId: filters.driverId } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: Math.min(filters.limit ?? 100, 500),
    });

    return rows.map(row => ({
      id: row.id,
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      driverId: row.driverId ?? undefined,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt.toISOString(),
      distanceKm: toNumber(row.distanceKm),
      durationSeconds: row.durationSeconds,
      stopCount: row.stopCount,
      stopSeconds: row.stopSeconds,
      maxSpeedKmH: toNumber(row.maxSpeedKmH),
      avgSpeedKmH: toNumber(row.avgSpeedKmH),
      startLatitude: toNumber(row.startLatitude),
      startLongitude: toNumber(row.startLongitude),
      endLatitude: toNumber(row.endLatitude),
      endLongitude: toNumber(row.endLongitude),
      pointCount: row.pointCount,
    }));
  });
}

/** Derniers points d'un véhicule, du plus ancien au plus récent. */
export async function listVehiclePoints(
  organizationId: string,
  vehicleId: string,
  limit = 500,
): Promise<GpsPoint[]> {
  if (!isDatabaseEnabled()) return [];

  return withTenant(organizationId, async tx => {
    const rows = await tx.gpsPoint.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });

    const ENUM_TO_NETWORK: Record<string, GpsPoint['networkType']> = {
      FOURG: '4G',
      THREEG: '3G',
      TWOG: '2G',
      NONE: 'NONE',
    };

    return rows.reverse().map(row => ({
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      altitude: row.altitude ? Number(row.altitude) : undefined,
      speedKmH: Number(row.speedKmH),
      headingDegree: row.headingDegree,
      timestamp: row.recordedAt.toISOString(),
      accuracyMeters: Number(row.accuracyMeters),
      ignitionOn: row.ignitionOn,
      batteryLevelPct: row.batteryLevelPct,
      networkType: ENUM_TO_NETWORK[row.networkType] ?? 'NONE',
      eventFlags: row.eventFlags as GpsPoint['eventFlags'],
    }));
  });
}

/** Événements de conduite récents, tous véhicules confondus. */
export async function listRecentSafetyEvents(organizationId: string, limit = 200) {
  if (!isDatabaseEnabled()) return [];

  return withTenant(organizationId, async tx => {
    const rows = await tx.safetyEvent.findMany({
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
    return rows.map(mapSafetyEvent);
  });
}
