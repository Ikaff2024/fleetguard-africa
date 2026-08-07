import { isDatabaseEnabled, withTenant } from '../db/prisma.js';
import {
  DEFAULT_FRAMEWORK,
  nightHoursOf,
  type FatigueMetrics,
  LEGAL_FRAMEWORKS,
  type LegalRegion,
  type TripWindow,
  computeFatigue,
} from '../services/fatigue-builder.js';
import { toNumber } from './mappers.js';

/**
 * Charge de travail et fatigue, par chauffeur.
 *
 * Les heures viennent des trajets reconstruits : elles décrivent ce qui a été
 * fait, pas ce qui avait été prévu. C'est la différence entre un planning et
 * une mesure — et c'est la seule des deux qui permette de dire à un exploitant
 * que son chauffeur ne doit pas repartir.
 */

/** Deux semaines : de quoi couvrir le plafond bihebdomadaire réglementaire. */
const WINDOW_DAYS = 14;

export interface DriverFatigue extends FatigueMetrics {
  driverName: string;
  assignedVehicle?: string;
}

/** Mission réellement effectuée, déduite d'un trajet. */
export interface WorkedShift {
  id: string;
  driverId: string;
  driverName: string;
  vehicleImmatriculation: string;
  startedAt: string;
  endedAt: string;
  drivingHours: number;
  stopHours: number;
  nightHours: number;
  distanceKm: number;
}

export async function listFatigue(
  organizationId: string,
  region: LegalRegion = DEFAULT_FRAMEWORK.region,
): Promise<{
  framework: (typeof LEGAL_FRAMEWORKS)[number];
  drivers: DriverFatigue[];
  shifts: WorkedShift[];
}> {
  const framework = LEGAL_FRAMEWORKS.find(f => f.region === region) ?? DEFAULT_FRAMEWORK;

  if (!isDatabaseEnabled()) return { framework, drivers: [], shifts: [] };

  return withTenant(organizationId, async tx => {
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

    const [drivers, trips] = await Promise.all([
      tx.driver.findMany({
        where: { deletedAt: null },
        include: { assignedVehicle: { select: { immatriculation: true } } },
      }),
      tx.trip.findMany({ where: { startedAt: { gte: since } }, orderBy: { startedAt: 'desc' } }),
    ]);

    const vehicleOf = new Map<string, string>();
    for (const driver of drivers) {
      if (driver.assignedVehicle) vehicleOf.set(driver.id, driver.assignedVehicle.immatriculation);
    }

    const windowsOf = (driverId: string): TripWindow[] =>
      trips
        .filter(trip => trip.driverId === driverId)
        .map(trip => ({
          startedAt: trip.startedAt,
          endedAt: trip.endedAt,
          durationSeconds: trip.durationSeconds,
          stopSeconds: trip.stopSeconds,
          distanceKm: toNumber(trip.distanceKm),
        }));

    const measured = drivers.map(driver => ({
      ...computeFatigue(driver.id, windowsOf(driver.id), framework),
      driverName: driver.fullName,
      assignedVehicle: vehicleOf.get(driver.id),
    }));

    // Le plus exposé en tête : c'est celui-là qu'un exploitant doit voir en
    // ouvrant l'écran, pas le premier par ordre alphabétique.
    measured.sort((a, b) => b.fatigueScore - a.fatigueScore);

    const nameOf = new Map(drivers.map(driver => [driver.id, driver.fullName]));

    const shifts: WorkedShift[] = trips.slice(0, 100).map(trip => {
      const drivingSeconds = Math.max(0, trip.durationSeconds - trip.stopSeconds);
      return {
        id: trip.id,
        driverId: trip.driverId ?? '',
        driverName: trip.driverId ? (nameOf.get(trip.driverId) ?? 'Chauffeur retiré') : '—',
        vehicleImmatriculation: vehicleOf.get(trip.driverId ?? '') ?? '—',
        startedAt: trip.startedAt.toISOString(),
        endedAt: trip.endedAt.toISOString(),
        drivingHours: Math.round((drivingSeconds / 3600) * 10) / 10,
        stopHours: Math.round((trip.stopSeconds / 3600) * 10) / 10,
        // Le zéro était écrit en dur : un Cotonou-Malanville parti à 22 h
        // s'affichait comme un trajet de jour, alors que la fonction qui
        // découpe les heures nocturnes existe et sert déjà au score.
        nightHours: nightHoursOf({
          startedAt: trip.startedAt,
          endedAt: trip.endedAt,
          durationSeconds: trip.durationSeconds,
          stopSeconds: trip.stopSeconds,
          distanceKm: toNumber(trip.distanceKm),
        }),
        distanceKm: toNumber(trip.distanceKm),
      };
    });

    return { framework, drivers: measured, shifts };
  });
}
