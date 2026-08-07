-- CreateEnum
CREATE TYPE "RewardPayoutStatus" AS ENUM ('APPROVED', 'PAID', 'CANCELLED');







-- CreateTable
CREATE TABLE "reward_payouts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "method" "PayoutMethod" NOT NULL DEFAULT 'FUEL_VOUCHER',
    "status" "RewardPayoutStatus" NOT NULL DEFAULT 'APPROVED',
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reward_payouts_organizationId_periodStart_idx" ON "reward_payouts"("organizationId", "periodStart");

-- CreateIndex
CREATE INDEX "reward_payouts_organizationId_driverId_periodStart_idx" ON "reward_payouts"("organizationId", "driverId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "reward_payouts_driverId_periodStart_key" ON "reward_payouts"("driverId", "periodStart");

-- AddForeignKey
ALTER TABLE "reward_payouts" ADD CONSTRAINT "reward_payouts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_payouts" ADD CONSTRAINT "reward_payouts_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
