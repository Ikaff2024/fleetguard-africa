-- Réseau de ravitaillement conventionné, par organisation.
--
-- Les index PostGIS et trigram créés par prisma/sql/002 sont préservés : le
-- diff proposait de les supprimer, ce qui coûterait un scan séquentiel sur
-- chaque recherche de véhicule et chaque test d'appartenance à une zone.

-- CreateEnum
CREATE TYPE "FuelBrand" AS ENUM ('TOTAL_ENERGIES', 'ORYX', 'CORLAY', 'SHELL', 'PUMA', 'PETROCI', 'STAR_OIL', 'OTHER');

-- CreateTable
CREATE TABLE "fuel_stations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "brand" "FuelBrand" NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "location" geography(Point, 4326),
    "is24h" BOOLEAN NOT NULL DEFAULT false,
    "hasAdBlue" BOOLEAN NOT NULL DEFAULT false,
    "hasHeavyTruckParking" BOOLEAN NOT NULL DEFAULT false,
    "hasRestArea" BOOLEAN NOT NULL DEFAULT false,
    "hasMechanic" BOOLEAN NOT NULL DEFAULT false,
    "dieselPrice" DECIMAL(10,2),
    "adbluePrice" DECIMAL(10,2),
    "gasolinePrice" DECIMAL(10,2),
    "currency" "CurrencyCode",
    "priceObservedAt" TIMESTAMP(3),
    "contactPhone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "fuel_stations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fuel_stations_organizationId_isActive_idx" ON "fuel_stations"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_stations_organizationId_name_key" ON "fuel_stations"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "fuel_stations" ADD CONSTRAINT "fuel_stations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
