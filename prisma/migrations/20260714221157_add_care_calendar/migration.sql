-- CreateEnum
CREATE TYPE "CareCoverageFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY');

-- CreateEnum
CREATE TYPE "CareOccurrenceStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CareCalendarEventKind" AS ENUM ('APPOINTMENT', 'FAMILY', 'OTHER');

-- CreateEnum
CREATE TYPE "CareSwapStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CareInvoiceStatus" AS ENUM ('OPEN', 'PAID', 'VOID');

-- CreateTable
CREATE TABLE "care_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "lovedOneName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_person_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "defaultHourlyRate" DECIMAL(19,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_person_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_people" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "typeId" TEXT NOT NULL,
    "hourlyRate" DECIMAL(19,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_coverage_series" (
    "id" TEXT NOT NULL,
    "assigneeId" TEXT,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "frequency" "CareCoverageFrequency" NOT NULL,
    "daysOfWeek" INTEGER[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_coverage_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_coverage_occurrences" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT,
    "assigneeId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "CareOccurrenceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_coverage_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_calendar_events" (
    "id" TEXT NOT NULL,
    "kind" "CareCalendarEventKind" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_swap_requests" (
    "id" TEXT NOT NULL,
    "relinquishOccurrenceId" TEXT NOT NULL,
    "claimOccurrenceId" TEXT NOT NULL,
    "claimForPersonId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "CareSwapStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_invoices" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "carePersonId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "hourlyRateSnapshot" DECIMAL(19,4) NOT NULL,
    "hoursSnapshot" DECIMAL(19,4) NOT NULL,
    "status" "CareInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "financialAccountId" TEXT,
    "settledTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "care_person_types_name_key" ON "care_person_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "care_people_userId_key" ON "care_people"("userId");

-- CreateIndex
CREATE INDEX "care_people_typeId_idx" ON "care_people"("typeId");

-- CreateIndex
CREATE INDEX "care_coverage_series_assigneeId_idx" ON "care_coverage_series"("assigneeId");

-- CreateIndex
CREATE INDEX "care_coverage_occurrences_startsAt_endsAt_idx" ON "care_coverage_occurrences"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "care_coverage_occurrences_assigneeId_idx" ON "care_coverage_occurrences"("assigneeId");

-- CreateIndex
CREATE INDEX "care_coverage_occurrences_status_idx" ON "care_coverage_occurrences"("status");

-- CreateIndex
CREATE UNIQUE INDEX "care_coverage_occurrences_seriesId_startsAt_key" ON "care_coverage_occurrences"("seriesId", "startsAt");

-- CreateIndex
CREATE INDEX "care_calendar_events_startsAt_endsAt_idx" ON "care_calendar_events"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "care_swap_requests_status_idx" ON "care_swap_requests"("status");

-- CreateIndex
CREATE INDEX "care_swap_requests_requestedByUserId_idx" ON "care_swap_requests"("requestedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "care_invoices_occurrenceId_key" ON "care_invoices"("occurrenceId");

-- CreateIndex
CREATE UNIQUE INDEX "care_invoices_settledTransactionId_key" ON "care_invoices"("settledTransactionId");

-- CreateIndex
CREATE INDEX "care_invoices_status_idx" ON "care_invoices"("status");

-- CreateIndex
CREATE INDEX "care_invoices_carePersonId_idx" ON "care_invoices"("carePersonId");

-- AddForeignKey
ALTER TABLE "care_people" ADD CONSTRAINT "care_people_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_people" ADD CONSTRAINT "care_people_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "care_person_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_coverage_series" ADD CONSTRAINT "care_coverage_series_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "care_people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_coverage_occurrences" ADD CONSTRAINT "care_coverage_occurrences_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "care_coverage_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_coverage_occurrences" ADD CONSTRAINT "care_coverage_occurrences_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "care_people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_swap_requests" ADD CONSTRAINT "care_swap_requests_relinquishOccurrenceId_fkey" FOREIGN KEY ("relinquishOccurrenceId") REFERENCES "care_coverage_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_swap_requests" ADD CONSTRAINT "care_swap_requests_claimOccurrenceId_fkey" FOREIGN KEY ("claimOccurrenceId") REFERENCES "care_coverage_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_swap_requests" ADD CONSTRAINT "care_swap_requests_claimForPersonId_fkey" FOREIGN KEY ("claimForPersonId") REFERENCES "care_people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_swap_requests" ADD CONSTRAINT "care_swap_requests_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_swap_requests" ADD CONSTRAINT "care_swap_requests_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_invoices" ADD CONSTRAINT "care_invoices_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "care_coverage_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_invoices" ADD CONSTRAINT "care_invoices_carePersonId_fkey" FOREIGN KEY ("carePersonId") REFERENCES "care_people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_invoices" ADD CONSTRAINT "care_invoices_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_invoices" ADD CONSTRAINT "care_invoices_settledTransactionId_fkey" FOREIGN KEY ("settledTransactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
