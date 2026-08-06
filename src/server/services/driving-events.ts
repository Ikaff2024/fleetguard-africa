import type { GpsPoint, SafetyEventType } from '../../types';

/**
 * Détection des événements de conduite à partir des points GPS.
 *
 * Le calcul est fait côté serveur, jamais sur le terminal du chauffeur : un
 * score qui conditionne une sanction ou une prime ne peut pas dépendre d'un
 * appareil que l'intéressé a en main.
 *
 * Les seuils sont volontairement conservateurs. Un excès de vitesse détecté à
 * tort a un coût réel — il faut le contester, l'annuler, et la confiance dans
 * l'outil s'érode. Mieux vaut manquer une infraction que d'en inventer une.
 */

export interface DetectionThresholds {
  /** Vitesse au-delà de laquelle un poids lourd est en excès sur route ouverte. */
  openRoadSpeedLimitKmH: number;
  /** Durée minimale d'un dépassement pour qu'il compte : un pic isolé peut venir du GPS. */
  minOverspeedDurationSeconds: number;
  /** Marge de tolérance : les compteurs et le GPS ne s'accordent jamais parfaitement. */
  speedToleranceKmH: number;
  /** Plage horaire considérée comme conduite nocturne à risque. */
  nightStartHour: number;
  nightEndHour: number;
}

export const DEFAULT_THRESHOLDS: DetectionThresholds = {
  // Limite usuelle des poids lourds sur les axes inter-États d'Afrique de l'Ouest.
  openRoadSpeedLimitKmH: 80,
  minOverspeedDurationSeconds: 30,
  speedToleranceKmH: 5,
  nightStartHour: 0,
  nightEndHour: 5,
};

export interface DetectedEvent {
  eventType: SafetyEventType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recordedAt: string;
  latitude: number;
  longitude: number;
  speedKmH: number;
  speedLimitKmH?: number;
  durationSeconds?: number;
  description: string;
  penaltyPointsDeducted: number;
}

/** Zone applicable à un point, telle que résolue par le moteur géographique. */
export interface ZoneContext {
  name: string;
  speedLimitKmH?: number;
  isRestricted: boolean;
}

function severityForOverspeed(excessKmH: number): DetectedEvent['severity'] {
  if (excessKmH >= 30) return 'CRITICAL';
  if (excessKmH >= 20) return 'HIGH';
  if (excessKmH >= 10) return 'MEDIUM';
  return 'LOW';
}

/**
 * Analyse une série de points ordonnés dans le temps.
 *
 * Les excès de vitesse sont regroupés en épisodes : cinq points consécutifs
 * au-dessus de la limite constituent une seule infraction, pas cinq. Compter
 * chaque point pénaliserait un chauffeur proportionnellement à la fréquence
 * d'échantillonnage de son boîtier, ce qui n'a aucun sens.
 */
export function detectEvents(
  points: GpsPoint[],
  options: {
    thresholds?: DetectionThresholds;
    /** Zone applicable à chaque point, dans le même ordre. */
    zones?: (ZoneContext | null)[];
  } = {},
): DetectedEvent[] {
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const events: DetectedEvent[] = [];

  const ordered = [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  let episodeStart: GpsPoint | null = null;
  let episodePeak = 0;
  let episodeLimit = thresholds.openRoadSpeedLimitKmH;
  let episodeZone: string | null = null;

  const closeOverspeedEpisode = (end: GpsPoint) => {
    if (!episodeStart) return;

    const durationSeconds = Math.round(
      (new Date(end.timestamp).getTime() - new Date(episodeStart.timestamp).getTime()) / 1000,
    );

    // Un dépassement trop bref relève plus probablement d'une imprécision de
    // mesure que d'un comportement : on ne le retient pas.
    if (durationSeconds >= thresholds.minOverspeedDurationSeconds) {
      const excess = Math.round(episodePeak - episodeLimit);
      events.push({
        eventType: 'OVER_SPEED',
        severity: severityForOverspeed(excess),
        recordedAt: episodeStart.timestamp,
        latitude: episodeStart.latitude,
        longitude: episodeStart.longitude,
        speedKmH: episodePeak,
        speedLimitKmH: episodeLimit,
        durationSeconds,
        description: episodeZone
          ? `Vitesse de ${episodePeak} km/h maintenue ${durationSeconds} s dans la zone « ${episodeZone} » (limite ${episodeLimit} km/h).`
          : `Vitesse de ${episodePeak} km/h maintenue ${durationSeconds} s sur un axe limité à ${episodeLimit} km/h.`,
        penaltyPointsDeducted: Math.min(10, Math.round(excess / 3)),
      });
    }

    episodeStart = null;
    episodePeak = 0;
    episodeZone = null;
  };

  ordered.forEach((point, index) => {
    const zone = options.zones?.[index] ?? null;
    const limit = zone?.speedLimitKmH ?? thresholds.openRoadSpeedLimitKmH;
    const isOverspeed = point.speedKmH > limit + thresholds.speedToleranceKmH;

    if (isOverspeed) {
      if (!episodeStart) {
        episodeStart = point;
        episodeLimit = limit;
        episodeZone = zone?.name ?? null;
      }
      episodePeak = Math.max(episodePeak, point.speedKmH);
    } else if (episodeStart) {
      closeOverspeedEpisode(point);
    }

    // Freinages et accélérations : signalés par l'accéléromètre de l'appareil,
    // qui mesure ce qu'aucun calcul sur des positions ne peut restituer.
    for (const flag of point.eventFlags ?? []) {
      if (flag === 'HARSH_BRAKE') {
        events.push({
          eventType: 'HARSH_BRAKING',
          severity: 'MEDIUM',
          recordedAt: point.timestamp,
          latitude: point.latitude,
          longitude: point.longitude,
          speedKmH: point.speedKmH,
          description: `Freinage brusque détecté à ${point.speedKmH} km/h.`,
          penaltyPointsDeducted: 2,
        });
      }
      if (flag === 'HARSH_ACCEL') {
        events.push({
          eventType: 'RAPID_ACCELERATION',
          severity: 'LOW',
          recordedAt: point.timestamp,
          latitude: point.latitude,
          longitude: point.longitude,
          speedKmH: point.speedKmH,
          description: `Accélération brutale détectée à ${point.speedKmH} km/h.`,
          penaltyPointsDeducted: 1,
        });
      }
    }

    // Zone interdite : la présence seule constitue l'infraction.
    if (zone?.isRestricted) {
      events.push({
        eventType: 'GEOFENCE_BREACH',
        severity: 'HIGH',
        recordedAt: point.timestamp,
        latitude: point.latitude,
        longitude: point.longitude,
        speedKmH: point.speedKmH,
        description: `Présence dans la zone à accès restreint « ${zone.name} ».`,
        penaltyPointsDeducted: 5,
      });
    }
  });

  const last = ordered[ordered.length - 1];
  if (episodeStart && last) closeOverspeedEpisode(last);

  // Conduite nocturne : un seul événement par nuit et par lot, quel que soit le
  // nombre de points. C'est la période d'exposition qui est en cause, pas
  // chaque instant qui la compose.
  const nightPoints = ordered.filter(point => {
    if (!point.ignitionOn || point.speedKmH <= 5) return false;
    const hour = new Date(point.timestamp).getUTCHours();
    return hour >= thresholds.nightStartHour && hour < thresholds.nightEndHour;
  });

  if (nightPoints.length > 0) {
    const first = nightPoints[0]!;
    const lastNight = nightPoints[nightPoints.length - 1]!;
    const durationSeconds = Math.round(
      (new Date(lastNight.timestamp).getTime() - new Date(first.timestamp).getTime()) / 1000,
    );

    events.push({
      eventType: 'FATIGUE_NIGHT_DRIVING',
      severity: durationSeconds > 3600 ? 'HIGH' : 'MEDIUM',
      recordedAt: first.timestamp,
      latitude: first.latitude,
      longitude: first.longitude,
      speedKmH: first.speedKmH,
      durationSeconds,
      description: `Conduite entre ${thresholds.nightStartHour}h et ${thresholds.nightEndHour}h, période où la vigilance chute.`,
      penaltyPointsDeducted: durationSeconds > 3600 ? 4 : 2,
    });
  }

  return events;
}

/** Au-delà, ce n'est plus un déplacement mais un artefact du signal. */
export const MAX_PLAUSIBLE_SPEED_KMH = 200;

/** Distance entre deux positions, en kilomètres, par la formule de haversine. */
export function distanceBetweenKm(from: GpsPoint, to: GpsPoint): number {
  const R = 6371;
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.latitude * Math.PI) / 180) *
      Math.cos((to.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Distance parcourue, en kilomètres.
 *
 * C'est cette distance qui normalise le score : sans elle, un chauffeur
 * parcourant 1 000 km serait pénalisé comme celui qui en fait 100 pour un même
 * nombre d'incidents.
 */
export function distanceTravelledKm(points: GpsPoint[]): number {
  const ordered = [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  let total = 0;
  for (let i = 1; i < ordered.length; i++) {
    const from = ordered[i - 1]!;
    const to = ordered[i]!;

    // Un saut de position sans temps écoulé trahit une dérive GPS : l'ignorer
    // évite de créditer un kilométrage fantôme.
    const elapsedSeconds = (new Date(to.timestamp).getTime() - new Date(from.timestamp).getTime()) / 1000;
    if (elapsedSeconds <= 0) continue;

    const segment = distanceBetweenKm(from, to);

    const impliedSpeedKmH = (segment / elapsedSeconds) * 3600;
    if (impliedSpeedKmH > MAX_PLAUSIBLE_SPEED_KMH) continue;

    total += segment;
  }

  return Math.round(total * 100) / 100;
}
