-- Reconstruction des trajets.
--
-- Les index spatiaux (PostGIS) et trigram sont créés par
-- prisma/sql/002_postgis_and_partitions.sql : Prisma ne les connaît pas et
-- proposait donc de les supprimer. Ils sont volontairement écartés ici.

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "driverId" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "distanceKm" DECIMAL(10,2) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "stopCount" INTEGER NOT NULL DEFAULT 0,
    "stopSeconds" INTEGER NOT NULL DEFAULT 0,
    "maxSpeedKmH" DECIMAL(6,2) NOT NULL,
    "avgSpeedKmH" DECIMAL(6,2) NOT NULL,
    "startLatitude" DECIMAL(9,6) NOT NULL,
    "startLongitude" DECIMAL(9,6) NOT NULL,
    "endLatitude" DECIMAL(9,6) NOT NULL,
    "endLongitude" DECIMAL(9,6) NOT NULL,
    "pointCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trips_organizationId_startedAt_idx" ON "trips"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "trips_organizationId_driverId_startedAt_idx" ON "trips"("organizationId", "driverId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "trips_vehicleId_startedAt_key" ON "trips"("vehicleId", "startedAt");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
