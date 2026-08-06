/**
 * Dérivation des alertes opérationnelles.
 *
 * Une alerte n'est pas une donnée saisie : c'est la lecture d'un fait déjà
 * enregistré ailleurs — une infraction relevée, un document qui approche de sa
 * date, une révision dépassée, un plein incohérent. Le rôle de ce module est
 * de traduire ces faits en quelque chose qu'un régulateur peut traiter.
 *
 * Deux règles gouvernent l'écriture :
 *
 *   - **Rien n'est inventé.** Chaque alerte porte l'identifiant du fait qui
 *     l'a produite. Un chiffre affiché à l'écran doit pouvoir être remonté
 *     jusqu'à sa source, sinon il ne peut pas fonder une sanction.
 *   - **La dérivation est rejouable.** Elle tourne à chaque consultation ; le
 *     couple (sourceType, sourceId) garantit qu'un même fait ne produit jamais
 *     deux alertes, et le traitement déjà effectué n'est jamais écrasé.
 */

export type AlertCategory = 'GEOFENCE' | 'HARSH_DRIVING' | 'FUEL_ANOMALY' | 'MAINTENANCE' | 'COMPLIANCE';

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DerivedAlert {
  /**
   * Nature du fait à l'origine de l'alerte. `SAFETY_PATTERN_*` désigne une
   * répétition attribuée à un chauffeur, les autres un enregistrement unique.
   */
  sourceType: string;
  /** Identifiant du fait — ou du chauffeur, pour une répétition. */
  sourceId: string;
  category: AlertCategory;
  severity: AlertSeverity;
  recordedAt: Date;
  title: string;
  description: string;
  vehicleId?: string;
  driverId?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  metricValue?: string;
  metricLabel?: string;
}

export interface AlertThresholds {
  /** Un document est signalé à partir de ce nombre de jours avant expiration. */
  documentNoticeDays: number;
  /** Révision signalée à partir de cette distance restante. */
  serviceNoticeKm: number;
  /** Écart de consommation au-delà duquel le plein est jugé incohérent. */
  fuelDeviationPct: number;
  /**
   * Nombre d'écarts mineurs de même nature, pour un même chauffeur, à partir
   * duquel la répétition devient une alerte.
   */
  minorEventPatternCount: number;
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  // Trente jours : le délai réel d'obtention d'une visite technique ou d'une
  // carte brune CEDEAO dans la sous-région. Alerter la veille ne sert à rien.
  documentNoticeDays: 30,
  serviceNoticeKm: 1000,
  // Vingt pour cent au-dessus de la consommation de référence. En dessous, la
  // charge, le relief et l'état de la route expliquent l'écart.
  fuelDeviationPct: 20,
  minorEventPatternCount: 3,
};

interface SafetyEventInput {
  id: string;
  eventType: string;
  severity: string;
  recordedAt: Date;
  vehicleId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  speedKmH: number;
  speedLimitKmH?: number;
  durationSeconds?: number;
  description: string;
}

interface ComplianceDocInput {
  id: string;
  title: string;
  docType: string;
  docNumber: string;
  expiryDate: Date;
  vehicleId?: string;
  driverId?: string;
}

interface VehicleInput {
  id: string;
  immatriculation: string;
  currentOdometerKm: number;
  nextServiceKm?: number;
}

interface FuelLogInput {
  id: string;
  vehicleId: string;
  driverId?: string;
  loggedAt: Date;
  stationName: string;
  litersAdded: number;
  calculatedL100km?: number;
  suspectedFuelTheft: boolean;
  expectedConsumptionL100km: number;
}

export interface AlertSources {
  safetyEvents: SafetyEventInput[];
  complianceDocs: ComplianceDocInput[];
  vehicles: VehicleInput[];
  fuelLogs: FuelLogInput[];
}

const SAFETY_LABELS: Record<string, { title: string; category: AlertCategory }> = {
  OVER_SPEED: { title: 'Excès de vitesse', category: 'HARSH_DRIVING' },
  HARSH_BRAKING: { title: 'Freinage brusque', category: 'HARSH_DRIVING' },
  RAPID_ACCELERATION: { title: 'Accélération brutale', category: 'HARSH_DRIVING' },
  FATIGUE_NIGHT_DRIVING: { title: 'Conduite de nuit prolongée', category: 'HARSH_DRIVING' },
  GEOFENCE_BREACH: { title: 'Franchissement de zone', category: 'GEOFENCE' },
  IDLING_EXCESS: { title: 'Moteur tournant à l’arrêt', category: 'HARSH_DRIVING' },
};

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Traduction des écarts de conduite en alertes.
 *
 * Tout écart relevé ne mérite pas d'alerte. Un freinage brusque isolé ne
 * réclame aucune décision : il pèse déjà sur le score du chauffeur, et c'est
 * sa place. Le signaler individuellement noierait le régulateur — une liste de
 * quatre-vingts lignes identiques n'est plus lue, et les incidents qui
 * comptaient vraiment y disparaissent.
 *
 * Deux traitements distincts, donc :
 *   - un écart grave (HIGH, CRITICAL) donne une alerte à lui seul ;
 *   - les écarts mineurs ne remontent que par leur répétition, regroupés par
 *     chauffeur et par nature. « Douze freinages brusques en trente jours »
 *     appelle un entretien ; un freinage, non.
 */
function isSevere(severity: string): boolean {
  return severity === 'HIGH' || severity === 'CRITICAL';
}

function fromSafetyPattern(driverId: string, eventType: string, events: SafetyEventInput[]): DerivedAlert {
  const label = SAFETY_LABELS[eventType] ?? {
    title: 'Écarts de conduite',
    category: 'HARSH_DRIVING' as const,
  };
  const latest = events.reduce((a, b) => (a.recordedAt > b.recordedAt ? a : b));

  return {
    // Le chauffeur porte la répétition : une alerte par chauffeur et par
    // nature d'écart, qui s'actualise à mesure que les faits s'accumulent.
    sourceType: `SAFETY_PATTERN_${eventType}`,
    sourceId: driverId,
    category: label.category,
    // La répétition d'écarts mineurs pèse plus qu'un écart isolé, sans jamais
    // atteindre la gravité d'une infraction unique caractérisée.
    severity: events.length >= 10 ? 'HIGH' : 'MEDIUM',
    recordedAt: latest.recordedAt,
    title: `${label.title} — comportement répété`,
    description: `${events.length} occurrences relevées sur la période, dont la dernière le ${latest.recordedAt.toISOString().slice(0, 10)}. Un entretien avec le chauffeur est indiqué.`,
    vehicleId: latest.vehicleId,
    driverId,
    latitude: latest.latitude,
    longitude: latest.longitude,
    metricLabel: 'Occurrences',
    metricValue: `${events.length} sur la période`,
  };
}

/** Alerte issue d'une infraction grave, relevée sur la trace. */
function fromSafetyEvent(event: SafetyEventInput): DerivedAlert {
  const label = SAFETY_LABELS[event.eventType] ?? {
    title: 'Événement de conduite',
    category: 'HARSH_DRIVING' as const,
  };

  return {
    sourceType: 'SAFETY_EVENT',
    sourceId: event.id,
    category: label.category,
    severity: event.severity as AlertSeverity,
    recordedAt: event.recordedAt,
    title: label.title,
    description: event.description,
    vehicleId: event.vehicleId,
    driverId: event.driverId,
    latitude: event.latitude,
    longitude: event.longitude,
    metricLabel: event.speedLimitKmH ? 'Vitesse relevée' : 'Vitesse',
    metricValue: event.speedLimitKmH
      ? `${Math.round(event.speedKmH)} km/h (limite ${Math.round(event.speedLimitKmH)})`
      : `${Math.round(event.speedKmH)} km/h`,
  };
}

/**
 * Alerte d'expiration de document.
 *
 * Un camion immobilisé à un poste frontière pour une carte brune périmée coûte
 * bien davantage que son renouvellement : la gravité monte à mesure que la
 * date approche, et devient critique une fois dépassée.
 */
function fromComplianceDoc(
  doc: ComplianceDocInput,
  now: Date,
  thresholds: AlertThresholds,
): DerivedAlert | null {
  const remainingDays = daysBetween(now, doc.expiryDate);
  if (remainingDays > thresholds.documentNoticeDays) return null;

  const expired = remainingDays < 0;

  return {
    sourceType: 'COMPLIANCE_DOC',
    sourceId: doc.id,
    category: 'COMPLIANCE',
    severity: expired ? 'CRITICAL' : remainingDays <= 7 ? 'HIGH' : 'MEDIUM',
    recordedAt: doc.expiryDate,
    title: expired ? `${doc.title} expiré` : `${doc.title} bientôt expiré`,
    description: expired
      ? `Le document ${doc.docNumber} est expiré depuis ${Math.abs(remainingDays)} jour(s). Le véhicule est exposé à une immobilisation au premier contrôle.`
      : `Le document ${doc.docNumber} expire dans ${remainingDays} jour(s). Engager le renouvellement dès maintenant.`,
    vehicleId: doc.vehicleId,
    driverId: doc.driverId,
    metricLabel: 'Échéance',
    metricValue: doc.expiryDate.toISOString().slice(0, 10),
  };
}

/** Alerte de révision, fondée sur l'odomètre réellement remonté du terrain. */
function fromVehicleService(
  vehicle: VehicleInput,
  now: Date,
  thresholds: AlertThresholds,
): DerivedAlert | null {
  if (!vehicle.nextServiceKm) return null;

  const remainingKm = vehicle.nextServiceKm - vehicle.currentOdometerKm;
  if (remainingKm > thresholds.serviceNoticeKm) return null;

  const overdue = remainingKm < 0;

  return {
    sourceType: 'VEHICLE_SERVICE',
    sourceId: vehicle.id,
    category: 'MAINTENANCE',
    severity: overdue ? 'HIGH' : 'MEDIUM',
    // L'échéance n'a pas de date : elle se mesure en kilomètres. On horodate au
    // moment du constat, faute de mieux.
    recordedAt: now,
    title: overdue
      ? `Révision dépassée — ${vehicle.immatriculation}`
      : `Révision proche — ${vehicle.immatriculation}`,
    description: overdue
      ? `Le véhicule a dépassé son échéance d'entretien de ${Math.abs(remainingKm)} km. Poursuivre l'exploitation expose à une panne immobilisante.`
      : `Il reste ${remainingKm} km avant l'échéance d'entretien. Planifier le passage à l'atelier.`,
    vehicleId: vehicle.id,
    metricLabel: 'Compteur',
    metricValue: `${vehicle.currentOdometerKm} km / ${vehicle.nextServiceKm} km`,
  };
}

/**
 * Alerte de consommation.
 *
 * Le libellé reste factuel. Un écart de consommation n'établit pas un vol : il
 * peut venir d'une charge lourde, d'une piste dégradée ou d'un injecteur usé.
 * Accuser un chauffeur sur un seuil, sans contrôle humain, serait à la fois
 * injuste et juridiquement fragile.
 */
function fromFuelLog(log: FuelLogInput, thresholds: AlertThresholds): DerivedAlert | null {
  const consumption = log.calculatedL100km;
  const expected = log.expectedConsumptionL100km;

  const deviationPct = consumption && expected > 0 ? ((consumption - expected) / expected) * 100 : 0;

  const excessive = deviationPct >= thresholds.fuelDeviationPct;
  if (!excessive && !log.suspectedFuelTheft) return null;

  return {
    sourceType: 'FUEL_LOG',
    sourceId: log.id,
    category: 'FUEL_ANOMALY',
    severity: deviationPct >= thresholds.fuelDeviationPct * 2 ? 'HIGH' : 'MEDIUM',
    recordedAt: log.loggedAt,
    title: 'Consommation supérieure à la référence',
    description: consumption
      ? `Relevé de ${consumption.toFixed(1)} L/100 km à ${log.stationName}, contre ${expected.toFixed(1)} attendus (+${Math.round(deviationPct)} %). À rapprocher de la charge transportée et de l'état du moteur avant toute conclusion.`
      : `Plein signalé pour contrôle à ${log.stationName}.`,
    vehicleId: log.vehicleId,
    driverId: log.driverId,
    locationName: log.stationName,
    metricLabel: 'Consommation',
    metricValue: consumption ? `${consumption.toFixed(1)} L/100 km` : `${log.litersAdded} L`,
  };
}

/** Traduit l'ensemble des faits d'une organisation en alertes. */
export function deriveAlerts(
  sources: AlertSources,
  options: { now?: Date; thresholds?: AlertThresholds } = {},
): DerivedAlert[] {
  const now = options.now ?? new Date();
  const thresholds = options.thresholds ?? DEFAULT_ALERT_THRESHOLDS;

  const severe = sources.safetyEvents.filter(event => isSevere(event.severity));

  // Les écarts mineurs sont regroupés par chauffeur et par nature ; en dessous
  // du seuil de répétition, ils ne produisent aucune alerte.
  const patterns = new Map<string, SafetyEventInput[]>();
  for (const event of sources.safetyEvents) {
    if (isSevere(event.severity)) continue;
    const key = `${event.driverId}|${event.eventType}`;
    const bucket = patterns.get(key);
    if (bucket) bucket.push(event);
    else patterns.set(key, [event]);
  }

  const patternAlerts: DerivedAlert[] = [];
  for (const [key, events] of patterns) {
    if (events.length < thresholds.minorEventPatternCount) continue;
    const [driverId, eventType] = key.split('|') as [string, string];
    patternAlerts.push(fromSafetyPattern(driverId, eventType, events));
  }

  const alerts: DerivedAlert[] = [
    ...severe.map(fromSafetyEvent),
    ...patternAlerts,
    ...sources.complianceDocs
      .map(doc => fromComplianceDoc(doc, now, thresholds))
      .filter((alert): alert is DerivedAlert => alert !== null),
    ...sources.vehicles
      .map(vehicle => fromVehicleService(vehicle, now, thresholds))
      .filter((alert): alert is DerivedAlert => alert !== null),
    ...sources.fuelLogs
      .map(log => fromFuelLog(log, thresholds))
      .filter((alert): alert is DerivedAlert => alert !== null),
  ];

  // Le plus récent d'abord : c'est l'ordre dans lequel un régulateur travaille.
  return alerts.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
}
