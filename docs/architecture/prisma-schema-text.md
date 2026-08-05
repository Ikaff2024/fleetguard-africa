# prismaSchemaText

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum UserRole {
  SUPER_ADMIN
  ORGANIZATION_ADMIN
  FLEET_MANAGER
  SAFETY_OFFICER
  MAINTENANCE_TECH
  DRIVER
}

enum VehicleStatus {
  ACTIVE
  MAINTENANCE
  IDLE
  OUT_OF_SERVICE
}

enum VehicleType {
  HEAVY_TRUCK
  MEDIUM_TRUCK
  VAN
  PICKUP
  BUS
  CONTAINER_CARRIER
}

model Organization {
  id            String   @id @default(uuid())
  name          String
  code          String   @unique
  country       String
  currency      String   @default("XOF")
  timezone      String   @default("Africa/Abidjan")
  maxVehicles   Int      @default(50)
  createdAt     DateTime @default(now())

  users         User[]
  vehicles      Vehicle[]
  drivers       Driver[]
  geofences     Geofence[]
  scoreConfigs  DriverScoreConfig[]
  auditLogs     AuditLog[]

  @@map("organizations")
}

model User {
  id             String       @id @default(uuid())
  organizationId String
  email          String       @unique
  passwordHash   String
  fullName       String
  phone          String
  role           UserRole
  isActive       Boolean      @default(true)
  createdAt      DateTime     @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  auditLogs      AuditLog[]

  @@index([organizationId])
  @@map("users")
}

model Vehicle {
  id                        String        @id @default(uuid())
  organizationId            String
  immatriculation           String        @unique
  vin                       String?
  make                      String
  model                     String
  year                      Int
  type                      VehicleType
  fuelType                  String        @default("DIESEL")
  tankCapacityLiters        Float         @default(300)
  expectedConsumptionL100km Float         @default(32.0)
  currentOdometerKm         Float         @default(0)
  status                    VehicleStatus @default(ACTIVE)
  createdAt                 DateTime      @default(now())

  organization              Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  drivers                   Driver[]
  telemetry                 GpsTelemetry[]
  safetyEvents              SafetyEvent[]
  maintenanceLogs           MaintenanceLog[]
  fuelLogs                  FuelLog[]

  @@index([organizationId])
  @@map("vehicles")
}

model Driver {
  id                  String       @id @default(uuid())
  organizationId      String
  fullName            String
  phone               String
  licenseNumber       String
  licenseCategory     String
  licenseExpiryDate   DateTime
  currentSafetyScore  Float        @default(100.0)
  totalKmDriven       Float        @default(0)
  status              String       @default("AVAILABLE")
  assignedVehicleId   String?
  createdAt           DateTime     @default(now())

  organization        Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  assignedVehicle     Vehicle?     @relation(fields: [assignedVehicleId], references: [id], onDelete: SetNull)
  safetyEvents        SafetyEvent[]
  dailyScores         DriverDailyScore[]
  fuelLogs            FuelLog[]

  @@index([organizationId])
  @@map("drivers")
}

model GpsTelemetry {
  id              String   @id @default(uuid())
  organizationId  String
  vehicleId       String
  driverId        String
  latitude        Float
  longitude       Float
  altitude        Float?
  speedKmH        Float
  headingDegree   Float
  accuracyMeters  Float
  ignitionOn      Boolean
  batteryLevelPct Float
  networkType     String
  recordedAt      DateTime
  createdAt       DateTime @default(now())

  vehicle         Vehicle  @relation(fields: [vehicleId], references: [id], onDelete: Cascade)

  @@index([organizationId, vehicleId, recordedAt])
  @@map("gps_telemetry")
}

model SafetyEvent {
  id                    String   @id @default(uuid())
  organizationId        String
  vehicleId             String
  driverId              String
  eventType             String   // OVER_SPEED, HARSH_BRAKING, etc.
  severity              String   // LOW, MEDIUM, HIGH, CRITICAL
  speedKmH              Float
  speedLimitKmH         Float?
  latitude              Float
  longitude             Float
  recordedAt            DateTime
  penaltyPointsDeducted Float

  vehicle               Vehicle  @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
  driver                Driver   @relation(fields: [driverId], references: [id], onDelete: Cascade)

  @@index([organizationId, driverId, recordedAt])
  @@map("safety_events")
}

model DriverScoreConfig {
  id                        String   @id @default(uuid())
  organizationId            String
  version                   Int      @default(1)
  overspeedWeight           Float    @default(0.35)
  harshBrakingWeight        Float    @default(0.25)
  rapidAccelWeight          Float    @default(0.15)
  fatigueNightWeight        Float    @default(0.15)
  geofenceBreachWeight      Float    @default(0.10)
  normalizationDistanceKm   Float    @default(100.0)
  updatedAt                 DateTime @updatedAt

  organization              Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@map("driver_score_configs")
}

model DriverDailyScore {
  id                    String   @id @default(uuid())
  organizationId        String
  driverId              String
  date                  DateTime
  distanceDrivenKm      Float
  score                 Float
  overspeedCount        Int      @default(0)
  harshBrakingCount     Int      @default(0)
  rapidAccelCount       Int      @default(0)
  nightKmDriven         Float    @default(0)
  geofenceBreachesCount Int      @default(0)

  driver                Driver   @relation(fields: [driverId], references: [id], onDelete: Cascade)

  @@unique([driverId, date])
  @@index([organizationId, date])
  @@map("driver_daily_scores")
}

model Geofence {
  id              String   @id @default(uuid())
  organizationId  String
  name            String
  type            String   // WAREHOUSE, PORT, BORDER_POST, RESTRICTED_ZONE
  geometryType    String   // CIRCLE, POLYGON
  centerLat       Float?
  centerLng       Float?
  radiusMeters    Float?
  coordinatesJson String?  // Stringified GeoJSON coordinates
  speedLimitKmH   Float?
  createdAt       DateTime @default(now())

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@map("geofences")
}

model MaintenanceLog {
  id                  String   @id @default(uuid())
  organizationId      String
  vehicleId           String
  type                String   // PREVENTATIVE, CORRECTIVE, TIRE_REPLACEMENT
  description         String
  odometerKmAtService Float
  cost                Float
  currency            String   @default("XOF")
  serviceProvider     String
  performedAt         DateTime
  nextServiceKmDue    Float?
  status              String   @default("COMPLETED")

  vehicle             Vehicle  @relation(fields: [vehicleId], references: [id], onDelete: Cascade)

  @@index([organizationId, vehicleId])
  @@map("maintenance_logs")
}

model FuelLog {
  id                  String   @id @default(uuid())
  organizationId      String
  vehicleId           String
  driverId            String
  litersAdded         Float
  totalCost           Float
  currency            String   @default("XOF")
  pricePerLiter       Float
  odometerKm          Float
  stationName         String
  receiptNumber       String
  calculatedL100km    Float?
  suspectedFuelTheft  Boolean  @default(false)
  loggedAt            DateTime @default(now())

  vehicle             Vehicle  @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
  driver              Driver   @relation(fields: [driverId], references: [id], onDelete: Cascade)

  @@index([organizationId, vehicleId])
  @@map("fuel_logs")
}

model AuditLog {
  id             String       @id @default(uuid())
  organizationId String
  userId         String
  action         String
  resource       String
  ipAddress      String
  timestamp      DateTime     @default(now())
  detailsJson    String?

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([organizationId, timestamp])
  @@map("audit_logs")
}
