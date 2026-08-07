-- Seuils de détection ajustables par organisation.
--
-- Les valeurs par défaut reprennent celles du code : une organisation qui n'y
-- touche pas conserve le comportement documenté. Les index PostGIS et trigram
-- créés par prisma/sql/002 sont préservés.

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "minOverspeedDurationSeconds" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "nightEndHour" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "nightStartHour" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openRoadSpeedLimitKmH" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN     "speedToleranceKmH" INTEGER NOT NULL DEFAULT 5;
