/**
 * Protection des données personnelles des chauffeurs.
 *
 * Géolocaliser un salarié en continu est un traitement de données personnelles.
 * Les textes applicables aux corridors desservis — loi APDP au Bénin,
 * délibérations ARTCI en Côte d'Ivoire, NDPR au Nigeria, Data Protection Act au
 * Kenya — imposent tous les mêmes trois obligations, et une déclaration
 * administrative ne vaut rien si l'application ne sait pas les honorer :
 *
 *   1. **Une durée de conservation bornée et justifiée.** Conserver les
 *      positions indéfiniment est le manquement le plus courant, et le plus
 *      simple à constater lors d'un contrôle.
 *   2. **Le droit d'accès.** Un chauffeur doit pouvoir obtenir ce que
 *      l'entreprise détient sur lui, sous une forme lisible.
 *   3. **L'effacement.** À son départ, ses données de localisation n'ont plus
 *      de finalité.
 *
 * Ce module définit les durées et ce que recouvre un export. Il ne prétend pas
 * remplacer la déclaration : il la rend tenable.
 */

export interface RetentionPolicy {
  /** Positions brutes : la donnée la plus intrusive, la plus vite périmée. */
  gpsPointsDays: number;
  /** Trajets reconstruits : nécessaires aux rapports d'activité. */
  tripsDays: number;
  /** Infractions relevées : elles fondent le score et doivent être contestables. */
  safetyEventsDays: number;
  /** Alertes traitées : trace du travail du régulateur. */
  handledAlertsDays: number;
}

/**
 * Durées retenues.
 *
 * Chacune répond à une finalité, et s'arrête quand la finalité s'éteint. La
 * position brute d'il y a six mois ne sert plus à personne : le trajet
 * reconstruit qui en découle suffit aux rapports, et il est bien moins
 * intrusif.
 *
 * Les infractions vivent plus longtemps parce qu'un chauffeur doit pouvoir
 * contester une note qui lui coûte une prime, et qu'une contestation suppose
 * que la preuve existe encore.
 */
export const DEFAULT_RETENTION: RetentionPolicy = {
  gpsPointsDays: 90,
  tripsDays: 365,
  safetyEventsDays: 365,
  handledAlertsDays: 365,
};

/** Ce qu'un chauffeur peut demander à consulter. */
export interface DriverDataExport {
  generatedAt: string;
  driver: {
    id: string;
    fullName: string;
    phone: string;
    licenseNumber: string;
    licenseCategory: string;
    licenseExpiryDate: string;
    currentSafetyScore: number;
  };
  retention: RetentionPolicy;
  counts: {
    gpsPoints: number;
    trips: number;
    safetyEvents: number;
    fuelLogs: number;
  };
  trips: {
    startedAt: string;
    endedAt: string;
    distanceKm: number;
    durationSeconds: number;
    maxSpeedKmH: number;
  }[];
  safetyEvents: {
    recordedAt: string;
    eventType: string;
    severity: string;
    speedKmH: number;
    speedLimitKmH?: number;
    description: string;
    penaltyPointsDeducted: number;
    isDisputed: boolean;
  }[];
}

/**
 * Date de coupure d'une catégorie de données.
 *
 * Isolée dans une fonction pour que la règle soit testable : une purge qui se
 * trompe d'un facteur trente efface un an d'historique sans que personne ne
 * s'en aperçoive avant le prochain rapport.
 */
export function cutoffFor(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
