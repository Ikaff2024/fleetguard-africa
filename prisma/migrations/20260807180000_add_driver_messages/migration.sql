-- CreateEnum
CREATE TYPE "DriverMessageCategory" AS ENUM ('SAFETY_REMINDER', 'MISSION_UPDATE', 'FUEL_INSTRUCTION', 'MAINTENANCE_NOTICE', 'GENERAL');

-- CreateEnum
CREATE TYPE "DriverMessagePriority" AS ENUM ('NORMAL', 'URGENT', 'CRITICAL');

-- CreateTable
CREATE TABLE "driver_messages" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "senderUserId" UUID,
    "senderName" TEXT NOT NULL,
    "category" "DriverMessageCategory" NOT NULL DEFAULT 'GENERAL',
    "priority" "DriverMessagePriority" NOT NULL DEFAULT 'NORMAL',
    "body" TEXT NOT NULL,
    "ackRequired" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_messages_organizationId_driverId_sentAt_idx" ON "driver_messages"("organizationId", "driverId", "sentAt");

-- CreateIndex
CREATE INDEX "driver_messages_organizationId_sentAt_idx" ON "driver_messages"("organizationId", "sentAt");

-- AddForeignKey
ALTER TABLE "driver_messages" ADD CONSTRAINT "driver_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_messages" ADD CONSTRAINT "driver_messages_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
