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
  fuelPrices: {
    dieselPriceXOF: number;
    adbluePriceXOF?: number;
    gasolinePriceXOF?: number;
  };
  fuelStockStatus: 'OPTIMAL' | 'MEDIUM' | 'LOW_STOCK';
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
