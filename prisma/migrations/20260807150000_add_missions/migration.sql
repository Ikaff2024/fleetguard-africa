-- Missions planifiées.
--
-- Les index PostGIS et trigram créés par prisma/sql/002 sont préservés : le diff
-- proposait de les supprimer, ce qui coûterait un scan séquentiel sur chaque
-- recherche de véhicule, test de zone ou station la plus proche.

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "missions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "originLabel" TEXT NOT NULL,
    "destinationLabel" TEXT NOT NULL,
    "plannedDistanceKm" DECIMAL(10,2) NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "plannedDrivingHours" DECIMAL(5,2) NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "overrideReason" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "missions_organizationId_scheduledStart_idx" ON "missions"("organizationId", "scheduledStart");

-- CreateIndex
CREATE INDEX "missions_organizationId_driverId_scheduledStart_idx" ON "missions"("organizationId", "driverId", "scheduledStart");

-- CreateIndex
CREATE INDEX "missions_organizationId_status_idx" ON "missions"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
