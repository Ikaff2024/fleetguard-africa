-- Alertes opérationnelles persistées.
--
-- Les index PostGIS et trigram (gps_points_location_idx, geofences_area_idx,
-- vehicles_immat_trgm_idx, drivers_fullname_trgm_idx,
-- safety_events_location_idx) sont créés par prisma/sql/002 et volontairement
-- absents du schéma Prisma. Le diff proposait de les supprimer : les laisser
-- passer coûterait un scan séquentiel sur chaque recherche de véhicule et sur
-- chaque test d'appartenance à une zone.

-- CreateEnum
CREATE TYPE "AlertCategory" AS ENUM ('GEOFENCE', 'HARSH_DRIVING', 'FUEL_ANOMALY', 'MAINTENANCE', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('UNHANDLED', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "category" "AlertCategory" NOT NULL,
    "severity" "Severity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'UNHANDLED',
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "vehicleId" UUID,
    "driverId" UUID,
    "locationName" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "metricValue" TEXT,
    "metricLabel" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUser" UUID,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_organizationId_status_recordedAt_idx" ON "alerts"("organizationId", "status", "recordedAt");

-- CreateIndex
CREATE INDEX "alerts_organizationId_category_recordedAt_idx" ON "alerts"("organizationId", "category", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_organizationId_sourceType_sourceId_key" ON "alerts"("organizationId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
