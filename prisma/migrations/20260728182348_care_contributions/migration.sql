-- CreateEnum
CREATE TYPE "CareContributionBasis" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "CareSplitPolicy" AS ENUM ('FIXED_FIRST_THEN_PERCENT', 'BACKSTOP');

-- CreateEnum
CREATE TYPE "CareContributionCadence" AS ENUM ('WEEKLY', 'EVERY_N_WEEKS', 'MONTHLY');

-- CreateEnum
CREATE TYPE "CareContributionStatus" AS ENUM ('PROPOSED', 'POSTED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CareFundingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CareLedgerEntryKind" AS ENUM ('CHARGE', 'CONTRIBUTION', 'TRUE_UP', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "care_settings" ADD COLUMN     "backstopPersonId" TEXT,
ADD COLUMN     "coverageAccountId" TEXT,
ADD COLUMN     "fundingPeriodDay" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "plannedMonthlyBudget" DECIMAL(19,4),
ADD COLUMN     "splitPolicy" "CareSplitPolicy" NOT NULL DEFAULT 'FIXED_FIRST_THEN_PERCENT';

-- CreateTable
CREATE TABLE "care_contribution_profiles" (
    "id" TEXT NOT NULL,
    "carePersonId" TEXT NOT NULL,
    "basis" "CareContributionBasis" NOT NULL DEFAULT 'PERCENT',
    "percent" DECIMAL(9,6),
    "fixedAmount" DECIMAL(19,4),
    "fundingAccountId" TEXT,
    "cadence" "CareContributionCadence" NOT NULL DEFAULT 'MONTHLY',
    "intervalWeeks" INTEGER NOT NULL DEFAULT 1,
    "anchorDate" DATE,
    "monthDay" INTEGER,
    "autoPost" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_contribution_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_funding_periods" (
    "id" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "plannedBudget" DECIMAL(19,4) NOT NULL,
    "actualCost" DECIMAL(19,4),
    "status" "CareFundingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_funding_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_contribution_ledger_entries" (
    "id" TEXT NOT NULL,
    "carePersonId" TEXT NOT NULL,
    "fundingPeriodId" TEXT,
    "kind" "CareLedgerEntryKind" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "description" TEXT NOT NULL,
    "scheduledContributionId" TEXT,
    "transactionId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_contribution_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_scheduled_contributions" (
    "id" TEXT NOT NULL,
    "carePersonId" TEXT NOT NULL,
    "dueOn" DATE NOT NULL,
    "baseAmount" DECIMAL(19,4) NOT NULL,
    "carriedBalance" DECIMAL(19,4) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "status" "CareContributionStatus" NOT NULL DEFAULT 'PROPOSED',
    "fundingAccountIdSnapshot" TEXT,
    "transferGroupId" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_scheduled_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "care_contribution_profiles_carePersonId_key" ON "care_contribution_profiles"("carePersonId");

-- CreateIndex
CREATE INDEX "care_contribution_profiles_fundingAccountId_idx" ON "care_contribution_profiles"("fundingAccountId");

-- CreateIndex
CREATE INDEX "care_funding_periods_status_periodEnd_idx" ON "care_funding_periods"("status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "care_funding_periods_periodStart_key" ON "care_funding_periods"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "care_contribution_ledger_entries_scheduledContributionId_key" ON "care_contribution_ledger_entries"("scheduledContributionId");

-- CreateIndex
CREATE UNIQUE INDEX "care_contribution_ledger_entries_transactionId_key" ON "care_contribution_ledger_entries"("transactionId");

-- CreateIndex
CREATE INDEX "care_contribution_ledger_entries_fundingPeriodId_carePerson_idx" ON "care_contribution_ledger_entries"("fundingPeriodId", "carePersonId");

-- CreateIndex
CREATE INDEX "care_contribution_ledger_entries_carePersonId_createdAt_idx" ON "care_contribution_ledger_entries"("carePersonId", "createdAt");

-- CreateIndex
CREATE INDEX "care_scheduled_contributions_status_dueOn_idx" ON "care_scheduled_contributions"("status", "dueOn");

-- CreateIndex
CREATE INDEX "care_scheduled_contributions_transferGroupId_idx" ON "care_scheduled_contributions"("transferGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "care_scheduled_contributions_carePersonId_dueOn_key" ON "care_scheduled_contributions"("carePersonId", "dueOn");

-- AddForeignKey
ALTER TABLE "care_contribution_profiles" ADD CONSTRAINT "care_contribution_profiles_carePersonId_fkey" FOREIGN KEY ("carePersonId") REFERENCES "care_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_contribution_profiles" ADD CONSTRAINT "care_contribution_profiles_fundingAccountId_fkey" FOREIGN KEY ("fundingAccountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_contribution_ledger_entries" ADD CONSTRAINT "care_contribution_ledger_entries_carePersonId_fkey" FOREIGN KEY ("carePersonId") REFERENCES "care_people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_contribution_ledger_entries" ADD CONSTRAINT "care_contribution_ledger_entries_fundingPeriodId_fkey" FOREIGN KEY ("fundingPeriodId") REFERENCES "care_funding_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_contribution_ledger_entries" ADD CONSTRAINT "care_contribution_ledger_entries_scheduledContributionId_fkey" FOREIGN KEY ("scheduledContributionId") REFERENCES "care_scheduled_contributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_contribution_ledger_entries" ADD CONSTRAINT "care_contribution_ledger_entries_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_contribution_ledger_entries" ADD CONSTRAINT "care_contribution_ledger_entries_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_scheduled_contributions" ADD CONSTRAINT "care_scheduled_contributions_carePersonId_fkey" FOREIGN KEY ("carePersonId") REFERENCES "care_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_scheduled_contributions" ADD CONSTRAINT "care_scheduled_contributions_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_settings" ADD CONSTRAINT "care_settings_coverageAccountId_fkey" FOREIGN KEY ("coverageAccountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_settings" ADD CONSTRAINT "care_settings_backstopPersonId_fkey" FOREIGN KEY ("backstopPersonId") REFERENCES "care_people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one CHARGE per person per funding period, so re-closing a period is
-- idempotent. TRUE_UP rows stay unbounded, which is why this is a partial
-- index and cannot be expressed as a Prisma @@unique.
CREATE UNIQUE INDEX "care_ledger_one_charge_per_person_period"
  ON "care_contribution_ledger_entries" ("fundingPeriodId", "carePersonId")
  WHERE "kind" = 'CHARGE';
