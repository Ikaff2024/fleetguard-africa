import type { $Enums } from '../../generated/prisma/client.js';
import { isDatabaseEnabled, withTenant } from '../db/prisma.js';
import {
  DEFAULT_FRAMEWORK,
  LEGAL_FRAMEWORKS,
  type LegalRegion,
  type TripWindow,
  computeFatigue,
} from '../services/fatigue-builder.js';
import { type ExistingAssignment, type Feasibility, assessMission } from '../services/mission-planner.js';
import { toNumber } from './mappers.js';

/**
 * Missions planifiées.
 *
 * La faisabilité est réévaluée à chaque demande plutôt que figée : les heures
 * de conduite du chauffeur bougent au fil des remontées du terrain, et une
 * mission jugée possible hier peut ne plus l'être ce matin.
 */

export class MissionNotFound extends Error {}
export class MissionNotFeasible extends Error {
  constructor(readonly feasibility: Feasibility) {
    super('Mission non réalisable en l’état.');
  }
}

export interface MissionRecord {
  id: string;
  vehicleId: string;
  vehicleImmatriculation: string;
  driverId: string;
  driverName: string;
  originLabel: string;
  destinationLabel: string;
  plannedDistanceKm: number;
  scheduledStart: string;
  scheduledEnd: string;
  plannedDrivingHours: number;
  status: string;
  notes?: string;
  overrideReason?: string;
}

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/** Fenêtre de mesure de la charge : identique à celle de l'écran fatigue. */
const FATIGUE_WINDOW_DAYS = 14;

async function tripWindowsOf(tx: Tx, driverId: string): Promise<TripWindow[]> {
  const since = new Date(Date.now() - FATIGUE_WINDOW_DAYS * 86_400_000);
  const trips = await tx.trip.findMany({ where: { driverId, startedAt: { gte: since } } });

  return trips.map(trip => ({
    startedAt: trip.startedAt,
    endedAt: trip.endedAt,
    durationSeconds: trip.durationSeconds,
    stopSeconds: trip.stopSeconds,
    distanceKm: toNumber(trip.distanceKm),
  }));
}

/** Allure porte-à-porte de la flotte, déduite de ses propres trajets. */
async function paceOfFleet(tx: Tx) {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const trips = await tx.trip.findMany({ where: { startedAt: { gte: since } }, take: 500 });

  return trips.reduce(
    (acc, trip) => ({
      tripCount: acc.tripCount + 1,
      totalDistanceKm: acc.totalDistanceKm + toNumber(trip.distanceKm),
      totalDrivingHours: acc.totalDrivingHours + Math.max(0, trip.durationSeconds - trip.stopSeconds) / 3600,
    }),
    { tripCount: 0, totalDistanceKm: 0, totalDrivingHours: 0 },
  );
}

async function openAssignments(tx: Tx, excludeId?: string): Promise<ExistingAssignment[]> {
  const missions = await tx.mission.findMany({
    where: {
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });

  return missions.map(mission => ({
    id: mission.id,
    driverId: mission.driverId,
    vehicleId: mission.vehicleId,
    scheduledStart: mission.scheduledStart,
    scheduledEnd: mission.scheduledEnd,
  }));
}

export interface MissionInput {
  vehicleId: string;
  driverId: string;
  originLabel: string;
  destinationLabel: string;
  plannedDistanceKm: number;
  scheduledStart: string;
  notes?: string;
  /** Motif obligatoire pour valider malgré un dépassement constaté. */
  overrideReason?: string;
  region?: LegalRegion;
}

/** Évalue sans rien écrire : l'écran interroge avant de proposer d'enregistrer. */
export async function assess(organizationId: string, input: MissionInput): Promise<Feasibility> {
  if (!isDatabaseEnabled()) throw new Error('Base de données requise.');

  return withTenant(organizationId, async tx => {
    const framework = LEGAL_FRAMEWORKS.find(f => f.region === input.region) ?? DEFAULT_FRAMEWORK;
    const fatigue = computeFatigue(input.driverId, await tripWindowsOf(tx, input.driverId), framework);

    return assessMission(
      {
        driverId: input.driverId,
        vehicleId: input.vehicleId,
        scheduledStart: new Date(input.scheduledStart),
        plannedDistanceKm: input.plannedDistanceKm,
      },
      fatigue,
      framework,
      await openAssignments(tx),
      await paceOfFleet(tx),
    );
  });
}

export async function createMission(
  organizationId: string,
  input: MissionInput,
  userId?: string,
): Promise<{ id: string; feasibility: Feasibility }> {
  return withTenant(organizationId, async tx => {
    const framework = LEGAL_FRAMEWORKS.find(f => f.region === input.region) ?? DEFAULT_FRAMEWORK;
    const fatigue = computeFatigue(input.driverId, await tripWindowsOf(tx, input.driverId), framework);

    const feasibility = assessMission(
      {
        driverId: input.driverId,
        vehicleId: input.vehicleId,
        scheduledStart: new Date(input.scheduledStart),
        plannedDistanceKm: input.plannedDistanceKm,
      },
      fatigue,
      framework,
      await openAssignments(tx),
      await paceOfFleet(tx),
    );

    /**
     * Un dépassement n'est pas impossible, il est engageant.
     *
     * Un relais imprévu ou une frontière fermée peuvent justifier de passer
     * outre. Mais sans motif écrit, la mission est refusée : c'est cette trace
     * qui distingue une décision assumée d'une négligence, et c'est elle qu'on
     * demandera à l'entreprise après un accident.
     */
    if (!feasibility.feasible && !input.overrideReason) {
      throw new MissionNotFeasible(feasibility);
    }

    const mission = await tx.mission.create({
      data: {
        organizationId,
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        originLabel: input.originLabel,
        destinationLabel: input.destinationLabel,
        plannedDistanceKm: input.plannedDistanceKm,
        scheduledStart: new Date(input.scheduledStart),
        scheduledEnd: feasibility.scheduledEnd,
        plannedDrivingHours: feasibility.plannedDrivingHours,
        notes: input.notes,
        overrideReason: feasibility.feasible ? undefined : input.overrideReason,
        createdByUserId: userId,
      },
      select: { id: true },
    });

    return { id: mission.id, feasibility };
  });
}

export async function listMissions(organizationId: string): Promise<MissionRecord[]> {
  if (!isDatabaseEnabled()) return [];

  return withTenant(organizationId, async tx => {
    const missions = await tx.mission.findMany({
      orderBy: { scheduledStart: 'asc' },
      take: 200,
      include: {
        vehicle: { select: { immatriculation: true } },
        driver: { select: { fullName: true } },
      },
    });

    return missions.map(mission => ({
      id: mission.id,
      vehicleId: mission.vehicleId,
      vehicleImmatriculation: mission.vehicle.immatriculation,
      driverId: mission.driverId,
      driverName: mission.driver.fullName,
      originLabel: mission.originLabel,
      destinationLabel: mission.destinationLabel,
      plannedDistanceKm: toNumber(mission.plannedDistanceKm),
      scheduledStart: mission.scheduledStart.toISOString(),
      scheduledEnd: mission.scheduledEnd.toISOString(),
      plannedDrivingHours: toNumber(mission.plannedDrivingHours),
      status: mission.status,
      notes: mission.notes ?? undefined,
      overrideReason: mission.overrideReason ?? undefined,
    }));
  });
}

export async function updateMissionStatus(
  organizationId: string,
  missionId: string,
  status: $Enums.MissionStatus,
): Promise<void> {
  await withTenant(organizationId, async tx => {
    const { count } = await tx.mission.updateMany({ where: { id: missionId }, data: { status } });
    if (count === 0) throw new MissionNotFound();
  });
}
