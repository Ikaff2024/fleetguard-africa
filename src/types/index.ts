/**
 * FleetGuard Africa - Domain Type Definitions
 * Multi-tenant B2B Fleet Management Platform tailored for African logistics
 */

export type CurrencyCode = 'XOF' | 'XAF' | 'KES' | 'NGN' | 'GHS' | 'USD' | 'EUR';
export type TimeZone =
  'Africa/Abidjan' | 'Africa/Lagos' | 'Africa/Douala' | 'Africa/Nairobi' | 'Africa/Dakar' | 'UTC';

export type UserRole =
  'SUPER_ADMIN' | 'ORGANIZATION_ADMIN' | 'FLEET_MANAGER' | 'SAFETY_OFFICER' | 'MAINTENANCE_TECH' | 'DRIVER';

export interface User {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  avatarUrl?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  code: string; // e.g. "TRANSAFRIK", "SAHEL_EXPRESS"
  country: string;
  currency: CurrencyCode;
  timezone: TimeZone;
  logoUrl?: string;
  maxVehicles: number;
  contactEmail: string;
  contactPhone: string;
  createdAt: string;
}

export type VehicleType = 'HEAVY_TRUCK' | 'MEDIUM_TRUCK' | 'VAN' | 'PICKUP' | 'BUS' | 'CONTAINER_CARRIER';
export type VehicleStatus = 'ACTIVE' | 'MAINTENANCE' | 'IDLE' | 'OUT_OF_SERVICE';
export type FuelType = 'DIESEL' | 'GASOLINE' | 'HYBRID' | 'ELECTRIC';

export interface Vehicle {
  id: string;
  organizationId: string;
  immatriculation: string; // e.g. "AB-123-CD" or "RB-4592-A"
  vin: string;
  make: string;
  model: string;
  year: number;
  type: VehicleType;
  fuelType: FuelType;
  tankCapacityLiters: number;
  expectedConsumptionL100km: number;
  currentOdometerKm: number;
  status: VehicleStatus;
  currentDriverId?: string;
  speedGovernorId?: string;
  gpsTrackerImei?: string;
  lastServiceDate?: string;
  nextServiceKm?: number;
  createdAt: string;
}

export interface Driver {
  id: string;
  organizationId: string;
  userId?: string;
  fullName: string;
  phone: string;
  licenseNumber: string;
  licenseCategory: string; // e.g. "C", "CE", "D"
  licenseExpiryDate: string;
  assignedVehicleId?: string;
  currentSafetyScore: number; // 0 - 100
  totalKmDriven: number;
  status: 'AVAILABLE' | 'ON_TRIP' | 'OFF_DUTY' | 'SUSPENDED';
  avatarUrl?: string;
  createdAt: string;
}

/**
 * Trajet reconstruit à partir de la trace GPS.
 *
 * Aucun boîtier n'émet de trajet : c'est une lecture du parcours, recalculée
 * côté serveur. La distance est mesurée point à point, jamais estimée à vol
 * d'oiseau entre le départ et l'arrivée.
 */
/**
 * Alerte opérationnelle telle que le serveur la renvoie.
 *
 * `sourceType` et `sourceId` désignent le fait qui l'a produite : sans cette
 * traçabilité, un chiffre affiché ne pourrait fonder aucune décision vis-à-vis
 * d'un chauffeur.
 */
/**
 * Profil de prime tel que le serveur le calcule.
 *
 * `ineligibilityReason` est renseigné dès que la prime est nulle : une prime
 * refusée doit pouvoir s'expliquer au chauffeur qui l'attendait.
 */
export interface RewardProfileRecord {
  driverId: string;
  driverName: string;
  assignedVehicle: string;
  currentSafetyScore: number;
  scoreTrend30d: number;
  ecoScore: number;
  fuelEfficiencySavingsL100km: number;
  estimatedFuelSavedLiters: number;
  bonusEarned: number;
  currency: string;
  eligible: boolean;
  ineligibilityReason?: string;
  payoutStatus: PayoutStatus;
  payoutMethod: 'ORANGE_MONEY' | 'MTN_MOMO' | 'WAVE' | 'FUEL_VOUCHER';
  lastPayoutAt?: string;
  /**
   * Bornes de la période récompensée.
   *
   * Le statut de versement s'y rapporte, et à elle seule : sans ces bornes,
   * l'écran affichait le montant du mois en cours sous la mention « versé »
   * d'une opération du mois précédent.
   */
  periodStart: string;
  periodEnd: string;
  /** Montant réellement constaté versé pour cette période, s'il l'a été. */
  paidAmount?: number;
  totalPoints: number;
  rankInCompany: number;
  unlockedBadges: { badgeId: string; code: string; title: string; unlockedAt: string }[];
}

/** Mission réellement effectuée, déduite d'un trajet reconstruit. */
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

export interface FatigueReport {
  framework: LegalDrivingFrameworkConfig;
  drivers: (DriverFatigueMetrics & {
    driverName: string;
    assignedVehicle?: string;
    /** Faux quand aucun trajet n'a été reconstruit : rien n'est mesurable. */
    hasData: boolean;
  })[];
  shifts: WorkedShift[];
}

export interface AlertRecord {
  id: string;
  organizationId: string;
  category: 'GEOFENCE' | 'HARSH_DRIVING' | 'FUEL_ANOMALY' | 'MAINTENANCE' | 'COMPLIANCE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'UNHANDLED' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
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

export interface Trip {
  id: string;
  organizationId: string;
  vehicleId: string;
  driverId?: string;
  startedAt: string;
  endedAt: string;
  distanceKm: number;
  durationSeconds: number;
  stopCount: number;
  stopSeconds: number;
  maxSpeedKmH: number;
  /** Moyenne hors temps d'arrêt : une pause de chargement ne la fausse pas. */
  avgSpeedKmH: number;
  startLatitude: number;
  startLongitude: number;
  endLatitude: number;
  endLongitude: number;
  pointCount: number;
}

export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  speedKmH: number;
  headingDegree: number;
  timestamp: string; // ISO String
  accuracyMeters: number;
  ignitionOn: boolean;
  batteryLevelPct: number;
  networkType: '4G' | '3G' | '2G' | 'NONE';
  eventFlags?: ('HARSH_BRAKE' | 'HARSH_ACCEL' | 'OVER_SPEED' | 'GEOFENCE_ENTER' | 'GEOFENCE_EXIT')[];
}

export interface GpsBatchPacket {
  batchId: string;
  organizationId: string;
  vehicleId: string;
  driverId: string;
  deviceId: string;
  sentAt: string;
  points: GpsPoint[];
}

export interface Geofence {
  id: string;
  organizationId: string;
  name: string;
  type: 'WAREHOUSE' | 'PORT' | 'BORDER_POST' | 'RESTRICTED_ZONE' | 'FUEL_STATION' | 'CUSTOM_CORRIDOR';
  geometryType: 'CIRCLE' | 'POLYGON';
  centerLat?: number;
  centerLng?: number;
  radiusMeters?: number;
  coordinates?: [number, number][]; // Polygon coordinates
  speedLimitKmH?: number;
  createdAt: string;
  isActive?: boolean;
  notifyOnEntry?: boolean;
  notifyOnExit?: boolean;
  notifyOnSpeeding?: boolean;
  notifyOnProlongedStay?: boolean;
  maxDwellTimeMinutes?: number;
  notificationChannels?: ('IN_APP' | 'SMS' | 'EMAIL')[];
  assignedVehicleIds?: string[];
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export type SafetyEventType =
  | 'OVER_SPEED'
  | 'HARSH_BRAKING'
  | 'RAPID_ACCELERATION'
  | 'FATIGUE_NIGHT_DRIVING'
  | 'GEOFENCE_BREACH'
  | 'IDLING_EXCESS';

export interface SafetyEvent {
  id: string;
  organizationId: string;
  vehicleId: string;
  driverId: string;
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

export interface DriverScoreConfig {
  id: string;
  organizationId: string;
  version: number;
  weights: {
    overspeedWeight: number; // e.g. 35%
    harshBrakingWeight: number; // e.g. 25%
    rapidAccelWeight: number; // e.g. 15%
    fatigueNightWeight: number; // e.g. 15%
    geofenceBreachWeight: number; // e.g. 10%
  };
  normalizationDistanceKm: number; // Standard distance, e.g., 100km
  updatedAt: string;
}

export interface DriverDailyScore {
  id: string;
  organizationId: string;
  driverId: string;
  date: string; // YYYY-MM-DD
  distanceDrivenKm: number;
  score: number; // 0 - 100
  overspeedCount: number;
  harshBrakingCount: number;
  rapidAccelCount: number;
  nightKmDriven: number;
  geofenceBreachesCount: number;
  penaltyExplanations: {
    category: string;
    pointsLost: number;
    reason: string;
  }[];
}

export interface MaintenanceLog {
  id: string;
  organizationId: string;
  vehicleId: string;
  type: 'PREVENTATIVE' | 'CORRECTIVE' | 'TIRE_REPLACEMENT' | 'OIL_CHANGE' | 'BRAKE_SERVICE';
  description: string;
  odometerKmAtService: number;
  cost: number;
  currency: CurrencyCode;
  serviceProvider: string;
  performedAt: string;
  nextServiceKmDue?: number;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
  technicianName?: string;
  technicianNotes?: string;
  partsReplaced?: {
    partNumber: string;
    partName: string;
    quantity: number;
    unitCost: number;
  }[];
}

export interface FuelLog {
  id: string;
  organizationId: string;
  vehicleId: string;
  driverId: string;
  litersAdded: number;
  totalCost: number;
  currency: CurrencyCode;
  pricePerLiter: number;
  odometerKm: number;
  stationName: string;
  receiptNumber: string;
  calculatedL100km?: number;
  suspectedFuelTheft: boolean;
  loggedAt: string;
}

export interface ComplianceDoc {
  id: string;
  organizationId: string;
  vehicleId?: string;
  driverId?: string;
  title: string;
  docType:
    | 'INSURANCE'
    | 'TECHNICAL_INSPECTION'
    | 'CEDEAO_BROWN_CARD'
    | 'AXLE_LOAD_CERTIFICATE'
    | 'DRIVER_LICENSE'
    | 'HAZMAT_PERMIT';
  docNumber: string;
  issuedDate: string;
  expiryDate: string;
  status: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';
  fileUrl?: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  userId: string;
  userEmail: string;
  action: string; // e.g. "VEHICLE_CREATED", "DRIVER_SUSPENDED", "CONFIG_UPDATED"
  resource: string;
  ipAddress: string;
  timestamp: string;
  details?: Record<string, any>;
}

export interface FleetIntelligenceReport {
  timestamp: string;
  organizationId: string;
  summary: string;
  riskAssessment: {
    highRiskDriversCount: number;
    maintenanceAlertsCount: number;
    fuelAnomaliesCount: number;
    overallFleetHealthScore: number;
  };
  actionableInsights: {
    category: 'SAFETY' | 'FUEL' | 'MAINTENANCE' | 'COMPLIANCE';
    title: string;
    description: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    recommendedAction: string;
  }[];
  geminiAnalysisFrench: string;
}

/**
 * Station du réseau conventionné de l'organisation.
 *
 * Les prix sont facultatifs et datés. Un tarif affiché sans date induirait en
 * erreur le régulateur qui chiffre une mission : dans la sous-région, le prix à
 * la pompe bouge plusieurs fois par an et diffère d'un pays à l'autre. Quand il
 * manque, l'écran le dit plutôt que d'afficher une valeur par défaut.
 *
 * Le niveau de stock d'une station a été retiré : aucun flux ne le renseigne,
 * et annoncer un « risque de pénurie » sans source enverrait un chauffeur faire
 * un détour pour rien.
 */
export interface FuelStation {
  id: string;
  organizationId?: string;
  name: string;
  brand: 'TOTAL_ENERGIES' | 'ORYX' | 'CORLAY' | 'SHELL' | 'PUMA' | 'PETROCI' | 'STAR_OIL' | 'OTHER';
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  country: string;
  is24h: boolean;
  hasAdBlue: boolean;
  hasHeavyTruckParking: boolean;
  hasRestArea: boolean;
  hasMechanic: boolean;
  dieselPrice?: number;
  adbluePrice?: number;
  gasolinePrice?: number;
  currency?: string;
  priceObservedAt?: string;
  contactPhone?: string;
}

// ==========================================
// SHIFT & FATIGUE OPTIMIZER TYPES
// ==========================================

export type FatigueRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type BurnoutRiskCategory = 'MINIMAL' | 'MODERATE' | 'ELEVATED' | 'CRITICAL_BURNOUT';
export type LegalRegionFramework = 'UEMOA_CEDEAO' | 'EAC_EAST_AFRICA' | 'SADC_SOUTHERN';

export interface DriverFatigueMetrics {
  driverId: string;
  organizationId: string;
  fatigueScore: number; // 0 - 100% (Higher = More fatigued)
  /**
   * Faux quand aucun trajet n'a été reconstruit pour ce chauffeur.
   *
   * Sans ce drapeau, l'écran affichait « DISPONIBLE — prêt pour long-courrier »
   * pour un conducteur dont rien n'était mesuré : le serveur renvoie alors un
   * score de 0 et un niveau LOW faute de données, et l'absence de mesure se
   * lisait comme une autorisation de rouler.
   */
  hasData: boolean;
  fatigueLevel: FatigueRiskLevel;
  burnoutRisk: BurnoutRiskCategory;

  // Driving Hours Tracker
  hoursDrivenToday: number; // Max e.g. 9.0h
  hoursDrivenThisWeek: number; // Max e.g. 56.0h
  nightHoursDrivenLast7Days: number; // 22:00 - 06:00 driving
  consecutiveDaysWorked: number; // Days without 24h rest
  lastRestDurationHours: number; // Hours elapsed since last shift ended
  hoursSinceLastBreak: number; // Continuous hours driving on current trip

  // Legal Compliance & Limits
  breakComplianceStatus: 'COMPLIANT' | 'WARNING' | 'BREACH';
  maxDailyHoursLimit: number; // e.g. 9.0h (or 10h 2x/week under UEMOA)
  maxWeeklyHoursLimit: number; // e.g. 56.0h
  remainingDailyHours: number;
  remainingWeeklyHours: number;

  // Alerts & Recommendations
  isMandatoryRestEnforced: boolean;
  recommendedNextShiftStart?: string;
  primaryRecommendation: string;
  fatigueFactors: {
    factorName: string;
    impactScore: number; // 0 - 100
    description: string;
  }[];
}

export interface ShiftRotationSuggestion {
  driverId: string;
  driverName: string;
  assignedVehicleId?: string;
  suitabilityScore: number; // 0 - 100 (100 = Ideal match)
  suggestedRole: 'PRIMARY_CORRIDOR_DRIVER' | 'RELAY_DRIVER' | 'LOCAL_DISTRIBUTION' | 'MANDATORY_REST';
  fatigueScore: number;
  remainingDailyHours: number;
  remainingWeeklyHours: number;
  reasons: string[];
  warnings?: string[];
  recommendedShiftStart: string;
  recommendedShiftEnd: string;
}

export interface ShiftScheduleSlot {
  id: string;
  organizationId: string;
  driverId: string;
  driverName: string;
  assignedVehicleId: string;
  vehicleImmatriculation: string;
  routeTitle: string; // e.g., "Corridor Cotonou - Parakou"
  corridorDistanceKm: number;
  dayOfWeek: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
  shiftDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  plannedHours: number;
  nightHours: number;
  fatigueRiskOnCompletion: number; // Projected score after shift
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'SWAPPED' | 'REST_ENFORCED';
}

export interface LegalDrivingFrameworkConfig {
  region: LegalRegionFramework;
  name: string;
  maxDailyDrivingHours: number; // e.g. 9
  maxWeeklyDrivingHours: number; // e.g. 56
  maxBiWeeklyDrivingHours: number; // e.g. 90
  mandatoryBreakAfterHours: number; // e.g. 4.5
  mandatoryBreakDurationMinutes: number; // e.g. 45
  minDailyRestHours: number; // e.g. 11
  minWeeklyRestHours: number; // e.g. 45
  maxNightHoursPerShift: number; // e.g. 4
  description: string;
}

// ==========================================
// GAMIFICATION & FUEL REWARDS MODULE TYPES
// ==========================================

export type BadgeCategory = 'SAFETY' | 'ECO_DRIVING' | 'NIGHT_SAFETY' | 'LONG_HAUL' | 'MILESTONE';
export type BadgeRarity = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
export type PayoutStatus = 'ELIGIBLE' | 'CALCULATED' | 'APPROVED' | 'PAID' | 'ON_HOLD';

export interface DigitalBadge {
  id: string;
  code: string;
  title: string;
  description: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  iconName: string; // e.g. "ShieldCheck", "Zap", "Award", "Flame", "Moon", "Trophy"
  expBonusPoints: number;
  criterion: string;
  fuelBonusMultiplier: number; // e.g., 1.1x boost on fuel bonus
}

export interface DriverUnlockedBadge {
  badgeId: string;
  unlockedAt: string; // YYYY-MM-DD
  periodLabel: string; // e.g. "Juillet 2026"
  grantedBy: string; // "Système Automatique IA" or "Régulateur"
}

export interface DriverBadgeProgress {
  badgeId: string;
  currentValue: number;
  targetValue: number;
  percentage: number;
  unit: string;
}

export interface DriverRewardProfile {
  driverId: string;
  organizationId: string;
  driverName: string;
  assignedVehicle: string;
  currentSafetyScore: number;
  scoreTrend30d: number; // e.g. +8.5 or -2.0
  ecoScore: number; // 0 - 100

  // Fuel Efficiency & Bonus Metrics
  fuelEfficiencySavingsL100km: number; // e.g. -4.2 L/100km below benchmark
  estimatedFuelSavedLiters: number; // e.g. 185 L
  fuelBonusEarnedXOF: number; // Cash bonus value e.g. 65,000 XOF
  payoutStatus: PayoutStatus;
  payoutMethod: 'ORANGE_MONEY' | 'MTN_MOMO' | 'WAVE' | 'FUEL_VOUCHER';
  lastPayoutDate?: string;
  /**
   * Éligibilité telle que le serveur la calcule : score suffisant ET économie
   * mesurable. Compter sur le seul score surestimait les primes dues.
   */
  isEligibleForBonus: boolean;
  /** Montant réellement constaté versé pour la période, s'il l'a été. */
  paidAmountXOF?: number;
  ineligibilityReason?: string;

  // Gamification Metrics
  totalPoints: number;
  rankInCompany: number;
  unlockedBadges: DriverUnlockedBadge[];
  badgeProgress: DriverBadgeProgress[];

  // Performance Trend Indicators
  trendHighlights: {
    metric: string;
    trendType: 'POSITIVE' | 'NEUTRAL' | 'WARNING';
    description: string;
  }[];
}

export interface FuelBonusRuleConfig {
  organizationId: string;
  fuelPricePerLiterXOF: number; // Default e.g. 750 XOF/L
  sharedSavingsPercentage: number; // e.g. 50% returned to driver
  minSafetyScoreForBonus: number; // e.g. 85 / 100
  bonusPayoutCycle: 'WEEKLY' | 'MONTHLY';
  maxMonthlyBonusCapXOF: number; // e.g. 150,000 XOF
  baseTierBonusXOF: number; // Minimum bonus for score >= 90
}

export type DriverMessageCategory =
  'SAFETY_REMINDER' | 'MISSION_UPDATE' | 'FUEL_INSTRUCTION' | 'MAINTENANCE_NOTICE' | 'GENERAL';

export type DriverMessagePriority = 'NORMAL' | 'URGENT' | 'CRITICAL';

/**
 * Consigne adressée à un chauffeur.
 *
 * Les trois horodatages de réception sont volontairement nullables : tant que
 * le fait ne s'est pas produit, il n'y a rien à afficher. Un champ optionnel
 * rempli par défaut aurait reproduit la fabrication qu'ils remplacent.
 */
export interface DriverMessage {
  id: string;
  driverId: string;
  driverName: string;
  senderName: string;
  category: DriverMessageCategory;
  priority: DriverMessagePriority;
  body: string;
  ackRequired: boolean;
  sentAt: string;
  /** Posé quand le téléphone du chauffeur est venu chercher la consigne. */
  deliveredAt: string | null;
  /** Posé quand la consigne s'est affichée devant le chauffeur. */
  readAt: string | null;
  /** Posé quand le chauffeur a lui-même confirmé en avoir pris connaissance. */
  acknowledgedAt: string | null;
}
