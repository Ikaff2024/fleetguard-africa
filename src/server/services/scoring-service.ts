import { calculateDriverSafetyScore } from '../../data/scoring-engine.js';
import type { DriverScoreConfig } from '../../types';
import { isDatabaseEnabled, withTenant } from '../db/prisma.js';
import { toNumber } from '../repositories/mappers.js';

/**
 * Calcul et historisation du score de sécurité.
 *
 * Deux exigences du cahier des charges se rejoignent ici :
 *   - le score est **normalisé par la distance réellement parcourue**, issue de
 *     la télémétrie. Sans cela, un chauffeur faisant 1 000 km serait pénalisé
 *     comme celui qui en fait 100 pour un même nombre d'incidents ;
 *   - il est **historisé avec la version de configuration qui l'a produit**. Un
 *     score recalculé un an plus tard avec d'autres pondérations ne serait pas
 *     défendable devant un chauffeur, ni devant un inspecteur du travail.
 */

export interface ScorePeriod {
  from: Date;
  to: Date;
}

/** Fenêtre de calcul par défaut : les 30 derniers jours. */
export function defaultPeriod(): ScorePeriod {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

export interface DriverScoreSummary {
  score: number;
  distanceDrivenKm: number;
  /** `false` quand aucune télémétrie n'existe : le score n'a alors aucune valeur probante. */
  basedOnRealTelemetry: boolean;
  periodFrom: string;
  periodTo: string;
  configVersion: number;
  breakdown: ReturnType<typeof calculateDriverSafetyScore>['breakdown'];
  explanations: ReturnType<typeof calculateDriverSafetyScore>['explanations'];
  eventCounts: {
    overspeed: number;
    harshBraking: number;
    rapidAcceleration: number;
    nightDriving: number;
    geofenceBreach: number;
  };
}

/**
 * Distance parcourue sur la période, reconstituée depuis les points GPS.
 *
 * Le calcul est délégué à PostGIS : additionner les distances entre points
 * consécutifs en JavaScript imposerait de rapatrier des dizaines de milliers de
 * lignes pour n'en tirer qu'un nombre.
 */
async function distanceForDriver(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  driverId: string,
  period: ScorePeriod,
): Promise<number> {
  const rows = await tx.$queryRaw<{ distance_km: number | null }[]>`
    WITH ordered AS (
      SELECT location,
             LAG(location) OVER (ORDER BY "recordedAt") AS previous
      FROM gps_points
      WHERE "driverId" = ${driverId}::uuid
        AND "recordedAt" BETWEEN ${period.from} AND ${period.to}
        AND location IS NOT NULL
    )
    SELECT COALESCE(SUM(ST_Distance(previous, location)) / 1000.0, 0) AS distance_km
    FROM ordered
    WHERE previous IS NOT NULL
      -- Au-delà de 5 km entre deux points, c'est une reprise après zone
      -- blanche, pas un trajet continu : la compter fausserait la distance.
      AND ST_Distance(previous, location) < 5000
  `;

  return Math.round((rows[0]?.distance_km ?? 0) * 100) / 100;
}

/**
 * Calcule le score d'un chauffeur sur une période, à partir des événements et
 * de la distance réellement enregistrés.
 */
export async function computeDriverScore(
  organizationId: string,
  driverId: string,
  config: DriverScoreConfig,
  period: ScorePeriod = defaultPeriod(),
): Promise<DriverScoreSummary> {
  const counts = {
    overspeed: 0,
    harshBraking: 0,
    rapidAcceleration: 0,
    nightDriving: 0,
    geofenceBreach: 0,
  };

  let distanceKm = 0;
  let hasTelemetry = false;
  let nightHours = 0;

  if (isDatabaseEnabled()) {
    await withTenant(organizationId, async tx => {
      const events = await tx.safetyEvent.findMany({
        where: { driverId, recordedAt: { gte: period.from, lte: period.to } },
      });

      for (const event of events) {
        switch (event.eventType) {
          case 'OVER_SPEED':
            counts.overspeed++;
            break;
          case 'HARSH_BRAKING':
            counts.harshBraking++;
            break;
          case 'RAPID_ACCELERATION':
            counts.rapidAcceleration++;
            break;
          case 'GEOFENCE_BREACH':
            counts.geofenceBreach++;
            break;
          case 'FATIGUE_NIGHT_DRIVING':
            counts.nightDriving++;
            nightHours += (event.durationSeconds ?? 1800) / 3600;
            break;
          default:
            break;
        }
      }

      distanceKm = await distanceForDriver(tx, driverId, period);

      const pointCount = await tx.gpsPoint.count({
        where: { driverId, recordedAt: { gte: period.from, lte: period.to } },
      });
      hasTelemetry = pointCount > 0;
    });
  }

  const result = calculateDriverSafetyScore(
    {
      distanceDrivenKm: distanceKm,
      overspeedEventsCount: counts.overspeed,
      harshBrakingEventsCount: counts.harshBraking,
      rapidAccelEventsCount: counts.rapidAcceleration,
      nightHoursDriven: Math.round(nightHours * 10) / 10,
      geofenceBreachesCount: counts.geofenceBreach,
    },
    config,
  );

  return {
    score: result.score,
    distanceDrivenKm: distanceKm,
    basedOnRealTelemetry: hasTelemetry,
    periodFrom: period.from.toISOString(),
    periodTo: period.to.toISOString(),
    configVersion: config.version,
    breakdown: result.breakdown,
    explanations: result.explanations,
    eventCounts: counts,
  };
}

/**
 * Enregistre le score du jour et met à jour la valeur affichée sur la fiche
 * du chauffeur.
 *
 * L'historique est la référence ; le champ sur la fiche n'est qu'un cache
 * d'affichage, reconstructible à tout moment depuis les scores journaliers.
 */
export async function persistDailyScore(
  organizationId: string,
  driverId: string,
  configId: string,
  summary: DriverScoreSummary,
  date = new Date(),
): Promise<void> {
  if (!isDatabaseEnabled()) return;

  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  await withTenant(organizationId, async tx => {
    await tx.driverDailyScore.upsert({
      where: { driverId_date: { driverId, date: day } },
      update: {
        score: summary.score,
        distanceDrivenKm: summary.distanceDrivenKm,
        overspeedCount: summary.eventCounts.overspeed,
        harshBrakingCount: summary.eventCounts.harshBraking,
        rapidAccelCount: summary.eventCounts.rapidAcceleration,
        geofenceBreachesCount: summary.eventCounts.geofenceBreach,
        // Les explications sont stockées telles qu'elles ont été présentées :
        // les recalculer plus tard pourrait produire un texte différent de
        // celui que le chauffeur a lu.
        penaltyExplanations: JSON.parse(JSON.stringify(summary.explanations)),
      },
      create: {
        organizationId,
        driverId,
        configId,
        date: day,
        score: summary.score,
        distanceDrivenKm: summary.distanceDrivenKm,
        overspeedCount: summary.eventCounts.overspeed,
        harshBrakingCount: summary.eventCounts.harshBraking,
        rapidAccelCount: summary.eventCounts.rapidAcceleration,
        geofenceBreachesCount: summary.eventCounts.geofenceBreach,
        penaltyExplanations: JSON.parse(JSON.stringify(summary.explanations)),
      },
    });

    await tx.driver.updateMany({
      where: { id: driverId },
      data: { currentSafetyScore: summary.score },
    });
  });
}

/** Historique des scores journaliers, pour tracer une tendance. */
export async function listDailyScores(organizationId: string, driverId: string, days = 30) {
  if (!isDatabaseEnabled()) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return withTenant(organizationId, async tx => {
    const rows = await tx.driverDailyScore.findMany({
      where: { driverId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    return rows.map(row => ({
      date: row.date.toISOString().slice(0, 10),
      score: toNumber(row.score),
      distanceDrivenKm: toNumber(row.distanceDrivenKm),
      overspeedCount: row.overspeedCount,
      harshBrakingCount: row.harshBrakingCount,
      rapidAccelCount: row.rapidAccelCount,
      geofenceBreachesCount: row.geofenceBreachesCount,
    }));
  });
}
