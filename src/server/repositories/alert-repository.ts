import type { $Enums, Alert } from '../../generated/prisma/client.js';
import { isDatabaseEnabled, withTenant } from '../db/prisma.js';
import { type DerivedAlert, deriveAlerts } from '../services/alert-builder.js';
import { toNumber } from './mappers.js';

/**
 * Persistance des alertes.
 *
 * La dérivation est relancée à chaque consultation plutôt que confiée à une
 * tâche planifiée. Un ordonnanceur supposerait un processus supplémentaire à
 * surveiller, et une alerte en retard d'une heure sur un corridor n'a plus
 * d'utilité. Le coût reste modeste : les sources sont bornées et indexées par
 * organisation.
 *
 * Ce qui est écrit se limite au constat. Le traitement — acquittement,
 * résolution, note — n'est jamais touché par une re-dérivation.
 */

export interface AlertRecord {
  id: string;
  organizationId: string;
  category: string;
  severity: string;
  status: string;
  sourceType: string;
  sourceId: string;
  recordedAt: string;
  title: string;
  description: string;
  vehicleId?: string;
  driverId?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  metricValue?: string;
  metricLabel?: string;
  acknowledgedAt?: string;
  resolutionNote?: string;
  resolvedAt?: string;
}

/** Fenêtre de dérivation : au-delà, un incident relève de l'historique. */
const LOOKBACK_DAYS = 30;

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

async function collectSources(tx: Tx, now: Date) {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);

  const [safetyEvents, complianceDocs, vehicles, fuelLogs] = await Promise.all([
    tx.safetyEvent.findMany({
      where: { recordedAt: { gte: since } },
      orderBy: { recordedAt: 'desc' },
      take: 500,
    }),
    tx.complianceDoc.findMany({ where: { deletedAt: null } }),
    tx.vehicle.findMany({ where: { deletedAt: null } }),
    tx.fuelLog.findMany({
      where: { loggedAt: { gte: since } },
      orderBy: { loggedAt: 'desc' },
      take: 500,
      include: { vehicle: { select: { expectedConsumptionL100km: true } } },
    }),
  ]);

  return {
    safetyEvents: safetyEvents.map(event => ({
      id: event.id,
      eventType: event.eventType,
      severity: event.severity,
      recordedAt: event.recordedAt,
      vehicleId: event.vehicleId,
      driverId: event.driverId,
      latitude: toNumber(event.latitude),
      longitude: toNumber(event.longitude),
      speedKmH: toNumber(event.speedKmH),
      speedLimitKmH: event.speedLimitKmH ? toNumber(event.speedLimitKmH) : undefined,
      durationSeconds: event.durationSeconds ?? undefined,
      description: event.description,
    })),
    complianceDocs: complianceDocs.map(doc => ({
      id: doc.id,
      title: doc.title,
      docType: doc.docType,
      docNumber: doc.docNumber,
      expiryDate: doc.expiryDate,
      vehicleId: doc.vehicleId ?? undefined,
      driverId: doc.driverId ?? undefined,
    })),
    vehicles: vehicles.map(vehicle => ({
      id: vehicle.id,
      immatriculation: vehicle.immatriculation,
      currentOdometerKm: vehicle.currentOdometerKm,
      nextServiceKm: vehicle.nextServiceKm ?? undefined,
    })),
    fuelLogs: fuelLogs.map(log => ({
      id: log.id,
      vehicleId: log.vehicleId,
      driverId: log.driverId ?? undefined,
      loggedAt: log.loggedAt,
      stationName: log.stationName,
      litersAdded: toNumber(log.litersAdded),
      calculatedL100km: log.calculatedL100km ? toNumber(log.calculatedL100km) : undefined,
      suspectedFuelTheft: log.suspectedFuelTheft,
      expectedConsumptionL100km: toNumber(log.vehicle.expectedConsumptionL100km),
    })),
  };
}

async function persist(tx: Tx, organizationId: string, derived: DerivedAlert[]): Promise<void> {
  for (const alert of derived) {
    const constat = {
      category: alert.category,
      severity: alert.severity,
      recordedAt: alert.recordedAt,
      title: alert.title,
      description: alert.description,
      vehicleId: alert.vehicleId,
      driverId: alert.driverId,
      locationName: alert.locationName,
      latitude: alert.latitude,
      longitude: alert.longitude,
      metricValue: alert.metricValue,
      metricLabel: alert.metricLabel,
    };

    await tx.alert.upsert({
      where: {
        organizationId_sourceType_sourceId: {
          organizationId,
          sourceType: alert.sourceType,
          sourceId: alert.sourceId,
        },
      },
      // `update` ne porte que sur le constat : ni `status`, ni les champs
      // d'acquittement n'y figurent. C'est ce qui empêche une re-dérivation de
      // rouvrir une alerte qu'un régulateur a déjà traitée.
      update: constat,
      create: {
        organizationId,
        sourceType: alert.sourceType,
        sourceId: alert.sourceId,
        ...constat,
      },
    });
  }

  /**
   * Retrait des alertes que plus rien ne justifie.
   *
   * Sans cette étape, une carte brune renouvelée continuerait d'alerter et un
   * véhicule révisé resterait signalé : le tableau se remplirait d'un bruit
   * que personne ne peut faire taire, jusqu'à ce qu'on cesse de le lire.
   *
   * Seules les alertes **non traitées** disparaissent. Celles qu'un régulateur
   * a acquittées, résolues ou écartées sont la trace d'un travail effectué —
   * les effacer reviendrait à nier ce travail, et priverait d'explication en
   * cas de contrôle.
   */
  const stillJustified = derived.map(alert => ({
    sourceType: alert.sourceType,
    sourceId: alert.sourceId,
  }));

  await tx.alert.deleteMany({
    where: {
      status: 'UNHANDLED',
      ...(stillJustified.length > 0 ? { NOT: { OR: stillJustified } } : {}),
    },
  });
}

function mapAlert(row: Alert): AlertRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    category: row.category,
    severity: row.severity,
    status: row.status,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    recordedAt: row.recordedAt.toISOString(),
    title: row.title,
    description: row.description,
    vehicleId: row.vehicleId ?? undefined,
    driverId: row.driverId ?? undefined,
    locationName: row.locationName ?? undefined,
    latitude: row.latitude === null ? undefined : toNumber(row.latitude),
    longitude: row.longitude === null ? undefined : toNumber(row.longitude),
    metricValue: row.metricValue ?? undefined,
    metricLabel: row.metricLabel ?? undefined,
    acknowledgedAt: row.acknowledgedAt?.toISOString(),
    resolutionNote: row.resolutionNote ?? undefined,
    resolvedAt: row.resolvedAt?.toISOString(),
  };
}

/** Alertes de l'organisation, dérivées puis relues avec leur traitement. */
export async function listAlerts(organizationId: string, limit = 200): Promise<AlertRecord[]> {
  if (!isDatabaseEnabled()) return [];

  return withTenant(organizationId, async tx => {
    const sources = await collectSources(tx, new Date());
    await persist(tx, organizationId, deriveAlerts(sources));

    const rows = await tx.alert.findMany({
      orderBy: { recordedAt: 'desc' },
      take: Math.min(limit, 500),
    });

    return rows.map(mapAlert);
  });
}

export class AlertNotFound extends Error {}

/**
 * Enregistre le traitement d'une alerte.
 *
 * L'horodatage est posé par le serveur, jamais transmis par le client : une
 * date d'acquittement choisie par l'appelant n'aurait aucune valeur probante.
 */
export async function updateAlertStatus(
  organizationId: string,
  alertId: string,
  input: { status: $Enums.AlertStatus; resolutionNote?: string; userId?: string },
): Promise<AlertRecord> {
  return withTenant(organizationId, async tx => {
    const now = new Date();
    const resolved = input.status === 'RESOLVED' || input.status === 'DISMISSED';

    // `updateMany` filtré plutôt qu'`update` par identifiant : la clause reste
    // vraie même si le RLS venait à être contourné, et une alerte d'une autre
    // organisation ne serait de toute façon pas atteinte.
    const { count } = await tx.alert.updateMany({
      where: { id: alertId },
      data: {
        status: input.status,
        acknowledgedAt: now,
        acknowledgedByUser: input.userId,
        ...(input.resolutionNote !== undefined ? { resolutionNote: input.resolutionNote } : {}),
        ...(resolved ? { resolvedAt: now } : { resolvedAt: null }),
      },
    });

    if (count === 0) throw new AlertNotFound();

    const row = await tx.alert.findFirst({ where: { id: alertId } });
    if (!row) throw new AlertNotFound();

    return mapAlert(row);
  });
}
