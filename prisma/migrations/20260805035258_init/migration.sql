-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ORGANIZATION_ADMIN', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'MAINTENANCE_TECH', 'DRIVER');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('XOF', 'XAF', 'KES', 'NGN', 'GHS', 'USD', 'EUR');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('HEAVY_TRUCK', 'MEDIUM_TRUCK', 'VAN', 'PICKUP', 'BUS', 'CONTAINER_CARRIER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'IDLE', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('DIESEL', 'GASOLINE', 'HYBRID', 'ELECTRIC');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('AVAILABLE', 'ON_TRIP', 'OFF_DUTY', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "NetworkType" AS ENUM ('FOURG', 'THREEG', 'TWOG', 'NONE');

-- CreateEnum
CREATE TYPE "SafetyEventType" AS ENUM ('OVER_SPEED', 'HARSH_BRAKING', 'RAPID_ACCELERATION', 'FATIGUE_NIGHT_DRIVING', 'GEOFENCE_BREACH', 'IDLING_EXCESS');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "GeofenceType" AS ENUM ('WAREHOUSE', 'PORT', 'BORDER_POST', 'RESTRICTED_ZONE', 'FUEL_STATION', 'CUSTOM_CORRIDOR');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTATIVE', 'CORRECTIVE', 'TIRE_REPLACEMENT', 'OIL_CHANGE', 'BRAKE_SERVICE');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ComplianceDocType" AS ENUM ('INSURANCE', 'TECHNICAL_INSPECTION', 'CEDEAO_BROWN_CARD', 'AXLE_LOAD_CERTIFICATE', 'DRIVER_LICENSE', 'HAZMAT_PERMIT');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('VALID', 'EXPIRING_SOON', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('ELIGIBLE', 'CALCULATED', 'APPROVED', 'PAID', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('ORANGE_MONEY', 'MTN_MOMO', 'WAVE', 'FUEL_VOUCHER');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "timezone" TEXT NOT NULL,
    "logoUrl" TEXT,
    "maxVehicles" INTEGER NOT NULL DEFAULT 50,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tokensValidFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "immatriculation" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "type" "VehicleType" NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "tankCapacityLiters" DECIMAL(8,2) NOT NULL,
    "expectedConsumptionL100km" DECIMAL(6,2) NOT NULL,
    "currentOdometerKm" INTEGER NOT NULL DEFAULT 0,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "speedGovernorId" TEXT,
    "gpsTrackerImei" TEXT,
    "lastServiceDate" TIMESTAMP(3),
    "nextServiceKm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "licenseCategory" TEXT NOT NULL,
    "licenseExpiryDate" TIMESTAMP(3) NOT NULL,
    "assignedVehicleId" UUID,
    "currentSafetyScore" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "totalKmDriven" INTEGER NOT NULL DEFAULT 0,
    "status" "DriverStatus" NOT NULL DEFAULT 'AVAILABLE',
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_batches" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "batchId" TEXT NOT NULL,
    "deviceId" TEXT,
    "vehicleId" UUID NOT NULL,
    "driverId" UUID,
    "pointCount" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "telemetry_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gps_points" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "driverId" UUID,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "location" geography(Point, 4326),
    "altitude" DECIMAL(8,2),
    "speedKmH" DECIMAL(6,2) NOT NULL,
    "headingDegree" INTEGER NOT NULL,
    "accuracyMeters" DECIMAL(8,2) NOT NULL,
    "ignitionOn" BOOLEAN NOT NULL,
    "batteryLevelPct" INTEGER NOT NULL,
    "networkType" "NetworkType" NOT NULL,
    "eventFlags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gps_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "eventType" "SafetyEventType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "location" geography(Point, 4326),
    "speedKmH" DECIMAL(6,2) NOT NULL,
    "speedLimitKmH" DECIMAL(6,2),
    "durationSeconds" INTEGER,
    "description" TEXT NOT NULL,
    "penaltyPointsDeducted" DECIMAL(5,2) NOT NULL,
    "isDisputed" BOOLEAN NOT NULL DEFAULT false,
    "disputeNote" TEXT,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_score_configs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "overspeedWeight" DECIMAL(5,2) NOT NULL,
    "harshBrakingWeight" DECIMAL(5,2) NOT NULL,
    "rapidAccelWeight" DECIMAL(5,2) NOT NULL,
    "fatigueNightWeight" DECIMAL(5,2) NOT NULL,
    "geofenceBreachWeight" DECIMAL(5,2) NOT NULL,
    "normalizationDistanceKm" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_score_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_daily_scores" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "configId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "distanceDrivenKm" DECIMAL(10,2) NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "overspeedCount" INTEGER NOT NULL DEFAULT 0,
    "harshBrakingCount" INTEGER NOT NULL DEFAULT 0,
    "rapidAccelCount" INTEGER NOT NULL DEFAULT 0,
    "geofenceBreachesCount" INTEGER NOT NULL DEFAULT 0,
    "nightKmDriven" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "penaltyExplanations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_daily_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofences" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "GeofenceType" NOT NULL,
    "area" geography(Polygon, 4326),
    "centerLat" DECIMAL(9,6),
    "centerLng" DECIMAL(9,6),
    "radiusMeters" INTEGER,
    "speedLimitKmH" INTEGER,
    "maxDwellTimeMinutes" INTEGER,
    "notifyOnEntry" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnExit" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnSpeeding" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnProlongedStay" BOOLEAN NOT NULL DEFAULT false,
    "notificationChannels" TEXT[],
    "assignedVehicleIds" UUID[],
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "geofences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "description" TEXT NOT NULL,
    "odometerKmAtService" INTEGER NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "serviceProvider" TEXT NOT NULL,
    "technicianName" TEXT,
    "technicianNotes" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "nextServiceKmDue" INTEGER,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'COMPLETED',
    "partsReplaced" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "driverId" UUID,
    "litersAdded" DECIMAL(10,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "pricePerLiter" DECIMAL(10,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "odometerKm" INTEGER NOT NULL,
    "stationName" TEXT NOT NULL,
    "receiptNumber" TEXT,
    "receiptFileUrl" TEXT,
    "calculatedL100km" DECIMAL(6,2),
    "suspectedFuelTheft" BOOLEAN NOT NULL DEFAULT false,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "loggedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fuel_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_docs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID,
    "driverId" UUID,
    "title" TEXT NOT NULL,
    "docType" "ComplianceDocType" NOT NULL,
    "docNumber" TEXT NOT NULL,
    "issuedDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" "ComplianceStatus" NOT NULL DEFAULT 'VALID',
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "compliance_docs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_badges" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "iconName" TEXT NOT NULL,
    "expBonusPoints" INTEGER NOT NULL DEFAULT 0,
    "fuelBonusMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "criterion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digital_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_unlocked_badges" (
    "id" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "badgeId" UUID NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodLabel" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,

    CONSTRAINT "driver_unlocked_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_reward_profiles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "ecoScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "scoreTrend30d" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "fuelEfficiencySavingsL100km" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "estimatedFuelSavedLiters" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bonusEarned" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" "CurrencyCode" NOT NULL,
    "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'ELIGIBLE',
    "payoutMethod" "PayoutMethod" NOT NULL DEFAULT 'FUEL_VOUCHER',
    "lastPayoutAt" TIMESTAMP(3),
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "rankInCompany" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_reward_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "userEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE INDEX "organizations_code_idx" ON "organizations"("code");

-- CreateIndex
CREATE INDEX "users_organizationId_role_idx" ON "users"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_expiresAt_idx" ON "refresh_tokens"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "vehicles_organizationId_status_idx" ON "vehicles"("organizationId", "status");

-- CreateIndex
CREATE INDEX "vehicles_gpsTrackerImei_idx" ON "vehicles"("gpsTrackerImei");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_organizationId_immatriculation_key" ON "vehicles"("organizationId", "immatriculation");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_organizationId_vin_key" ON "vehicles"("organizationId", "vin");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_userId_key" ON "drivers"("userId");

-- CreateIndex
CREATE INDEX "drivers_organizationId_status_idx" ON "drivers"("organizationId", "status");

-- CreateIndex
CREATE INDEX "drivers_organizationId_currentSafetyScore_idx" ON "drivers"("organizationId", "currentSafetyScore");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_organizationId_licenseNumber_key" ON "drivers"("organizationId", "licenseNumber");

-- CreateIndex
CREATE INDEX "telemetry_batches_organizationId_receivedAt_idx" ON "telemetry_batches"("organizationId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "telemetry_batches_organizationId_batchId_key" ON "telemetry_batches"("organizationId", "batchId");

-- CreateIndex
CREATE INDEX "gps_points_organizationId_vehicleId_recordedAt_idx" ON "gps_points"("organizationId", "vehicleId", "recordedAt");

-- CreateIndex
CREATE INDEX "gps_points_organizationId_recordedAt_idx" ON "gps_points"("organizationId", "recordedAt");

-- CreateIndex
CREATE INDEX "safety_events_organizationId_driverId_recordedAt_idx" ON "safety_events"("organizationId", "driverId", "recordedAt");

-- CreateIndex
CREATE INDEX "safety_events_organizationId_eventType_recordedAt_idx" ON "safety_events"("organizationId", "eventType", "recordedAt");

-- CreateIndex
CREATE INDEX "driver_score_configs_organizationId_isActive_idx" ON "driver_score_configs"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "driver_score_configs_organizationId_version_key" ON "driver_score_configs"("organizationId", "version");

-- CreateIndex
CREATE INDEX "driver_daily_scores_organizationId_date_idx" ON "driver_daily_scores"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "driver_daily_scores_driverId_date_key" ON "driver_daily_scores"("driverId", "date");

-- CreateIndex
CREATE INDEX "geofences_organizationId_isActive_idx" ON "geofences"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "maintenance_logs_organizationId_vehicleId_performedAt_idx" ON "maintenance_logs"("organizationId", "vehicleId", "performedAt");

-- CreateIndex
CREATE INDEX "maintenance_logs_organizationId_status_idx" ON "maintenance_logs"("organizationId", "status");

-- CreateIndex
CREATE INDEX "fuel_logs_organizationId_vehicleId_loggedAt_idx" ON "fuel_logs"("organizationId", "vehicleId", "loggedAt");

-- CreateIndex
CREATE INDEX "fuel_logs_organizationId_suspectedFuelTheft_idx" ON "fuel_logs"("organizationId", "suspectedFuelTheft");

-- CreateIndex
CREATE INDEX "compliance_docs_organizationId_expiryDate_idx" ON "compliance_docs"("organizationId", "expiryDate");

-- CreateIndex
CREATE INDEX "compliance_docs_organizationId_status_idx" ON "compliance_docs"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "digital_badges_code_key" ON "digital_badges"("code");

-- CreateIndex
CREATE UNIQUE INDEX "driver_unlocked_badges_driverId_badgeId_periodLabel_key" ON "driver_unlocked_badges"("driverId", "badgeId", "periodLabel");

-- CreateIndex
CREATE UNIQUE INDEX "driver_reward_profiles_driverId_key" ON "driver_reward_profiles"("driverId");

-- CreateIndex
CREATE INDEX "driver_reward_profiles_organizationId_payoutStatus_idx" ON "driver_reward_profiles"("organizationId", "payoutStatus");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_userId_createdAt_idx" ON "audit_logs"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_resource_resourceId_idx" ON "audit_logs"("organizationId", "resource", "resourceId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_assignedVehicleId_fkey" FOREIGN KEY ("assignedVehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_batches" ADD CONSTRAINT "telemetry_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_batches" ADD CONSTRAINT "telemetry_batches_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_batches" ADD CONSTRAINT "telemetry_batches_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_points" ADD CONSTRAINT "gps_points_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_points" ADD CONSTRAINT "gps_points_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_points" ADD CONSTRAINT "gps_points_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_events" ADD CONSTRAINT "safety_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_events" ADD CONSTRAINT "safety_events_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_events" ADD CONSTRAINT "safety_events_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_score_configs" ADD CONSTRAINT "driver_score_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_daily_scores" ADD CONSTRAINT "driver_daily_scores_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_daily_scores" ADD CONSTRAINT "driver_daily_scores_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_daily_scores" ADD CONSTRAINT "driver_daily_scores_configId_fkey" FOREIGN KEY ("configId") REFERENCES "driver_score_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_docs" ADD CONSTRAINT "compliance_docs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_docs" ADD CONSTRAINT "compliance_docs_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_docs" ADD CONSTRAINT "compliance_docs_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_unlocked_badges" ADD CONSTRAINT "driver_unlocked_badges_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_unlocked_badges" ADD CONSTRAINT "driver_unlocked_badges_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "digital_badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_reward_profiles" ADD CONSTRAINT "driver_reward_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_reward_profiles" ADD CONSTRAINT "driver_reward_profiles_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
