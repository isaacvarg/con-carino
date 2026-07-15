-- CreateEnum
CREATE TYPE "CarePayInterval" AS ENUM ('PER_SHIFT', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "CareBillingStatus" AS ENUM ('NOT_BILLABLE', 'ACCRUED', 'INVOICED');

-- AlterTable
ALTER TABLE "care_people" ADD COLUMN "payInterval" "CarePayInterval" NOT NULL DEFAULT 'PER_SHIFT';
ALTER TABLE "care_people" ADD COLUMN "payWeekday" INTEGER;
ALTER TABLE "care_people" ADD COLUMN "payAnchorDate" DATE;
ALTER TABLE "care_people" ADD COLUMN "payMonthDay" INTEGER;

-- AlterTable
ALTER TABLE "care_coverage_occurrences" ADD COLUMN "billingStatus" "CareBillingStatus" NOT NULL DEFAULT 'NOT_BILLABLE';

-- CreateTable
CREATE TABLE "care_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "hourlyRateSnapshot" DECIMAL(19,4) NOT NULL,
    "hoursSnapshot" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add period columns before migrating lines
ALTER TABLE "care_invoices" ADD COLUMN "periodStart" TIMESTAMP(3);
ALTER TABLE "care_invoices" ADD COLUMN "periodEnd" TIMESTAMP(3);

-- Backfill: one line per existing 1:1 invoice
INSERT INTO "care_invoice_lines" (
  "id",
  "invoiceId",
  "occurrenceId",
  "amount",
  "hourlyRateSnapshot",
  "hoursSnapshot",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  i."id",
  i."occurrenceId",
  i."amount",
  i."hourlyRateSnapshot",
  i."hoursSnapshot",
  i."createdAt",
  i."updatedAt"
FROM "care_invoices" i;

UPDATE "care_invoices" i
SET
  "periodStart" = o."startsAt",
  "periodEnd" = o."endsAt"
FROM "care_coverage_occurrences" o
WHERE o."id" = i."occurrenceId";

UPDATE "care_coverage_occurrences" o
SET "billingStatus" = 'INVOICED'
FROM "care_invoice_lines" l
WHERE l."occurrenceId" = o."id";

-- Drop old invoice → occurrence link and header snapshot columns
ALTER TABLE "care_invoices" DROP CONSTRAINT IF EXISTS "care_invoices_occurrenceId_fkey";
DROP INDEX IF EXISTS "care_invoices_occurrenceId_key";
ALTER TABLE "care_invoices" DROP COLUMN "occurrenceId";
ALTER TABLE "care_invoices" DROP COLUMN "hourlyRateSnapshot";
ALTER TABLE "care_invoices" DROP COLUMN "hoursSnapshot";

-- CreateIndex
CREATE UNIQUE INDEX "care_invoice_lines_occurrenceId_key" ON "care_invoice_lines"("occurrenceId");
CREATE INDEX "care_invoice_lines_invoiceId_idx" ON "care_invoice_lines"("invoiceId");
CREATE INDEX "care_coverage_occurrences_billingStatus_idx" ON "care_coverage_occurrences"("billingStatus");

-- AddForeignKey
ALTER TABLE "care_invoice_lines" ADD CONSTRAINT "care_invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "care_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "care_invoice_lines" ADD CONSTRAINT "care_invoice_lines_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "care_coverage_occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
