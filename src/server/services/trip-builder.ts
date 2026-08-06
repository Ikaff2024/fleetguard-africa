import type { GpsPoint } from '../../types';
import { MAX_PLAUSIBLE_SPEED_KMH, distanceBetweenKm, distanceTravelledKm } from './driving-events.js';

/**
 * Reconstruction des trajets à partir des points GPS.
 *
 * Un trajet n'est pas émis par le terrain : c'est une lecture de la trace. Le
 * découpage repose sur trois signaux, dans cet ordre de fiabilité :
 *   1. le contact coupé — le signal le plus net ;
 *   2. une immobilité prolongée, contact mis (chargement, pause, embouteillage
 *      long) ;
 *   3. un trou dans la trace — traversée de zone blanche ou boîtier éteint.
 *
 * Le troisième cas mérite attention : sur les corridors africains, une coupure
 * réseau de deux heures est banale. La traiter comme une fin de trajet
 * découperait un Cotonou-Parakou en trois. Le seuil est donc large, et la
 * distance parcourue pendant la coupure n'est jamais inventée.
 */

export interface TripSegmentationOptions {
  /** Immobilité au-delà de laquelle le trajet est considéré terminé. */
  tripEndStopMinutes: number;
  /** Immobilité comptée comme un arrêt à l'intérieur d'un trajet. */
  stopThresholdMinutes: number;
  /** Trou dans la trace au-delà duquel on ne peut plus relier deux points. */
  maxGapMinutes: number;
  /** Vitesse en dessous de laquelle le véhicule est considéré à l'arrêt. */
  movingSpeedKmH: number;
  /** Un déplacement plus court n'est pas un trajet : manœuvre de parking. */
  minTripDistanceKm: number;
}

/**
 * Vitesse de pointe du trajet.
 *
 * Deux sources la renseignent, et elles ne se valent pas :
 *   - la vitesse déclarée par le boîtier, mesurée à l'instant de
 *     l'échantillonnage — elle ignore tout ce qui se passe entre deux points ;
 *   - la vitesse déduite du déplacement entre deux positions, qui couvre tout
 *     l'intervalle.
 *
 * Retenir la plus élevée des deux n'invente rien : un véhicule qui a franchi
 * deux kilomètres en une minute a bel et bien roulé à 120 km/h, quoi qu'ait
 * déclaré son boîtier. C'est aussi ce qui empêche un matériel mal réglé — ou
 * trafiqué — de dissimuler un excès de vitesse.
 *
 * Deux garde-fous évitent de transformer du bruit GPS en infraction : le
 * segment doit être assez long pour que l'imprécision de position ne domine
 * pas, et la vitesse obtenue doit rester physiquement plausible.
 */
const SEGMENT_MIN_SECONDS = 25;
const SEGMENT_MIN_KM = 0.15;

function peakSpeedKmH(points: GpsPoint[]): number {
  let peak = Math.max(...points.map(point => point.speedKmH));

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]!;
    const current = points[i]!;

    const seconds = (new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime()) / 1000;
    if (seconds < SEGMENT_MIN_SECONDS) continue;

    const km = distanceBetweenKm(previous, current);
    if (km < SEGMENT_MIN_KM) continue;

    const segmentKmH = km / (seconds / 3600);
    if (segmentKmH > MAX_PLAUSIBLE_SPEED_KMH) continue;

    if (segmentKmH > peak) peak = segmentKmH;
  }

  return Math.round(peak * 10) / 10;
}

export const DEFAULT_SEGMENTATION: TripSegmentationOptions = {
  tripEndStopMinutes: 20,
  stopThresholdMinutes: 5,
  // Deux heures : une zone blanche de corridor ne doit pas couper un trajet.
  maxGapMinutes: 120,
  movingSpeedKmH: 3,
  minTripDistanceKm: 0.5,
};

export interface BuiltTrip {
  startedAt: string;
  endedAt: string;
  distanceKm: number;
  durationSeconds: number;
  stopCount: number;
  stopSeconds: number;
  maxSpeedKmH: number;
  avgSpeedKmH: number;
  startLatitude: number;
  startLongitude: number;
  endLatitude: number;
  endLongitude: number;
  pointCount: number;
}

function elapsedMinutes(from: GpsPoint, to: GpsPoint): number {
  return (new Date(to.timestamp).getTime() - new Date(from.timestamp).getTime()) / 60_000;
}

/** Construit un trajet à partir d'une suite de points, ou `null` si trop court. */
function buildTrip(points: GpsPoint[], options: TripSegmentationOptions): BuiltTrip | null {
  if (points.length < 2) return null;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const distanceKm = distanceTravelledKm(points);

  // Une manœuvre de quelques mètres n'est pas un trajet : l'enregistrer
  // encombrerait l'historique sans rien apprendre au gestionnaire.
  if (distanceKm < options.minTripDistanceKm) return null;

  const durationSeconds = Math.round(
    (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 1000,
  );
  if (durationSeconds <= 0) return null;

  let stopCount = 0;
  let stopSeconds = 0;
  let stoppedSince: GpsPoint | null = null;

  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    const isMoving = point.speedKmH >= options.movingSpeedKmH;

    if (!isMoving && !stoppedSince) {
      stoppedSince = point;
    } else if (isMoving && stoppedSince) {
      const minutes = elapsedMinutes(stoppedSince, point);
      if (minutes >= options.stopThresholdMinutes) {
        stopCount++;
        stopSeconds += Math.round(minutes * 60);
      }
      stoppedSince = null;
    }
  }

  // Un arrêt encore en cours au dernier point compte s'il est assez long.
  if (stoppedSince) {
    const minutes = elapsedMinutes(stoppedSince, last);
    if (minutes >= options.stopThresholdMinutes) {
      stopCount++;
      stopSeconds += Math.round(minutes * 60);
    }
  }

  const movingSeconds = Math.max(1, durationSeconds - stopSeconds);

  return {
    startedAt: first.timestamp,
    endedAt: last.timestamp,
    distanceKm,
    durationSeconds,
    stopCount,
    stopSeconds,
    maxSpeedKmH: peakSpeedKmH(points),
    // Moyenne calculée hors arrêts : une moyenne incluant deux heures de
    // chargement ne dit rien du style de conduite.
    avgSpeedKmH: Math.round((distanceKm / (movingSeconds / 3600)) * 10) / 10,
    startLatitude: first.latitude,
    startLongitude: first.longitude,
    endLatitude: last.latitude,
    endLongitude: last.longitude,
    pointCount: points.length,
  };
}

/** Découpe une trace continue en trajets distincts. */
export function segmentTrips(
  points: GpsPoint[],
  options: TripSegmentationOptions = DEFAULT_SEGMENTATION,
): BuiltTrip[] {
  const ordered = [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const trips: BuiltTrip[] = [];
  let current: GpsPoint[] = [];
  let stoppedSince: GpsPoint | null = null;

  const closeCurrent = () => {
    const trip = buildTrip(current, options);
    if (trip) trips.push(trip);
    current = [];
    stoppedSince = null;
  };

  for (const point of ordered) {
    const previous = current[current.length - 1];

    if (previous) {
      const gapMinutes = elapsedMinutes(previous, point);

      // Trou dans la trace : impossible d'affirmer ce qui s'est passé entre les
      // deux. On clôt le trajet plutôt que d'inventer un parcours.
      if (gapMinutes >= options.maxGapMinutes) {
        closeCurrent();
      }
    }

    // Contact coupé : fin de trajet, signal le plus fiable.
    if (!point.ignitionOn) {
      if (current.length > 0) {
        current.push(point);
        closeCurrent();
      }
      continue;
    }

    const isMoving = point.speedKmH >= options.movingSpeedKmH;

    if (!isMoving) {
      if (!stoppedSince) stoppedSince = point;
      else if (elapsedMinutes(stoppedSince, point) >= options.tripEndStopMinutes) {
        // Immobilité prolongée contact mis : le trajet est terminé, la suite
        // en constituera un nouveau.
        current.push(point);
        closeCurrent();
        continue;
      }
    } else {
      stoppedSince = null;
    }

    current.push(point);
  }

  closeCurrent();
  return trips;
}
