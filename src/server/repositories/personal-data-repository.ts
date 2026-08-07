import { isDatabaseEnabled, withTenant } from '../db/prisma.js';
import {
  DEFAULT_RETENTION,
  type DriverDataExport,
  type RetentionPolicy,
  cutoffFor,
} from '../services/personal-data.js';
import { toNumber } from './mappers.js';

/**
 * Droit d'accès, effacement et purge.
 *
 * Ces trois opérations sont ce qu'une déclaration de traitement engage
 * réellement. Elles sont écrites ici plutôt que laissées à une tâche manuelle :
 * une obligation qui dépend de quelqu'un pour lancer un script n'est pas tenue.
 */

export class DriverNotFoundForExport extends Error {}

/** Ce que l'entreprise détient sur un chauffeur, sous une forme lisible. */
export async function exportDriverData(
  organizationId: string,
  driverId: string,
  retention: RetentionPolicy = DEFAULT_RETENTION,
): Promise<DriverDataExport> {
  if (!isDatabaseEnabled()) throw new Error('Base de données requise.');

  return withTenant(organizationId, async tx => {
    const driver = await tx.driver.findFirst({ where: { id: driverId, deletedAt: null } });
    if (!driver) throw new DriverNotFoundForExport();

    const [gpsCount, fuelCount, trips, events] = await Promise.all([
      tx.gpsPoint.count({ where: { driverId } }),
      tx.fuelLog.count({ where: { driverId } }),
      tx.trip.findMany({ where: { driverId }, orderBy: { startedAt: 'desc' }, take: 500 }),
      tx.safetyEvent.findMany({ where: { driverId }, orderBy: { recordedAt: 'desc' }, take: 500 }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      driver: {
        id: driver.id,
        fullName: driver.fullName,
        phone: driver.phone,
        licenseNumber: driver.licenseNumber,
        licenseCategory: driver.licenseCategory,
        licenseExpiryDate: driver.licenseExpiryDate.toISOString().slice(0, 10),
        currentSafetyScore: toNumber(driver.currentSafetyScore),
      },
      retention,
      counts: {
        gpsPoints: gpsCount,
        trips: trips.length,
        safetyEvents: events.length,
        fuelLogs: fuelCount,
      },
      trips: trips.map(trip => ({
        startedAt: trip.startedAt.toISOString(),
        endedAt: trip.endedAt.toISOString(),
        distanceKm: toNumber(trip.distanceKm),
        durationSeconds: trip.durationSeconds,
        maxSpeedKmH: toNumber(trip.maxSpeedKmH),
      })),
      safetyEvents: events.map(event => ({
        recordedAt: event.recordedAt.toISOString(),
        eventType: event.eventType,
        severity: event.severity,
        speedKmH: toNumber(event.speedKmH),
        speedLimitKmH: event.speedLimitKmH ? toNumber(event.speedLimitKmH) : undefined,
        description: event.description,
        penaltyPointsDeducted: toNumber(event.penaltyPointsDeducted),
        isDisputed: event.isDisputed,
      })),
    };
  });
}

export interface PurgeReport {
  gpsPoints: number;
  trips: number;
  safetyEvents: number;
  alerts: number;
  cutoffs: Record<string, string>;
}

/**
 * Purge des données au-delà de leur durée de conservation.
 *
 * Conserver les positions indéfiniment est le manquement le plus courant, et le
 * plus simple à constater lors d'un contrôle. La purge s'exécute au démarrage
 * du serveur puis chaque jour : une obligation qui attend qu'on lance un script
 * n'est pas tenue.
 *
 * Les alertes déjà traitées partent avec le reste, mais celles qui ne le sont
 * pas sont conservées : effacer un incident que personne n'a pris en charge
 * reviendrait à le faire disparaître.
 */
export async function purgeExpiredData(
  organizationId: string,
  retention: RetentionPolicy = DEFAULT_RETENTION,
): Promise<PurgeReport> {
  if (!isDatabaseEnabled()) {
    return { gpsPoints: 0, trips: 0, safetyEvents: 0, alerts: 0, cutoffs: {} };
  }

  const now = new Date();
  const gpsCutoff = cutoffFor(retention.gpsPointsDays, now);
  const tripCutoff = cutoffFor(retention.tripsDays, now);
  const eventCutoff = cutoffFor(retention.safetyEventsDays, now);
  const alertCutoff = cutoffFor(retention.handledAlertsDays, now);

  return withTenant(organizationId, async tx => {
    const gps = await tx.gpsPoint.deleteMany({ where: { recordedAt: { lt: gpsCutoff } } });
    const trips = await tx.trip.deleteMany({ where: { startedAt: { lt: tripCutoff } } });
    const events = await tx.safetyEvent.deleteMany({ where: { recordedAt: { lt: eventCutoff } } });
    const alerts = await tx.alert.deleteMany({
      where: { recordedAt: { lt: alertCutoff }, status: { in: ['RESOLVED', 'DISMISSED'] } },
    });

    return {
      gpsPoints: gps.count,
      trips: trips.count,
      safetyEvents: events.count,
      alerts: alerts.count,
      cutoffs: {
        gpsPoints: gpsCutoff.toISOString(),
        trips: tripCutoff.toISOString(),
        safetyEvents: eventCutoff.toISOString(),
        alerts: alertCutoff.toISOString(),
      },
    };
  });
}

/**
 * Effacement des données de localisation d'un chauffeur.
 *
 * À son départ, sa géolocalisation n'a plus de finalité. Sa fiche est conservée
 * — elle porte des obligations qui survivent au contrat, notamment la traçabilité
 * des interventions et des documents de conformité — mais les traces de
 * déplacement disparaissent.
 */
export async function eraseDriverLocationData(
  organizationId: string,
  driverId: string,
): Promise<{ gpsPoints: number; trips: number }> {
  return withTenant(organizationId, async tx => {
    const driver = await tx.driver.findFirst({ where: { id: driverId } });
    if (!driver) throw new DriverNotFoundForExport();

    const gps = await tx.gpsPoint.deleteMany({ where: { driverId } });
    const trips = await tx.trip.deleteMany({ where: { driverId } });

    return { gpsPoints: gps.count, trips: trips.count };
  });
}
