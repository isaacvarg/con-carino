-- Rate bands: an occurrence can now yield more than one invoice line, one per
-- priced sub-window, so a shift straddling the assignee's typical schedule
-- bills each part at its own rate.

-- CreateEnum
CREATE TYPE "CareRateBand" AS ENUM ('STANDARD', 'OFF_SCHEDULE');

-- AlterTable: care_people gains the typical schedule and the premium rate.
ALTER TABLE "care_people" ADD COLUMN     "offScheduleRate" DECIMAL(19,4),
ADD COLUMN     "standardDaysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "standardEndTime" TEXT,
ADD COLUMN     "standardStartTime" TEXT;

-- AlterTable: add the segment columns nullable first so existing rows survive.
ALTER TABLE "care_invoice_lines" ADD COLUMN     "rateBand" "CareRateBand" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "segmentEnd" TIMESTAMP(3),
ADD COLUMN     "segmentStart" TIMESTAMP(3);

-- Backfill: before this migration every line covered exactly one whole
-- occurrence, so the occurrence bounds are the segment bounds. Exact, not an
-- approximation.
UPDATE "care_invoice_lines" l
SET "segmentStart" = o."startsAt",
    "segmentEnd"   = o."endsAt"
FROM "care_coverage_occurrences" o
WHERE o."id" = l."occurrenceId";

ALTER TABLE "care_invoice_lines" ALTER COLUMN "segmentEnd" SET NOT NULL,
ALTER COLUMN "segmentStart" SET NOT NULL;

-- DropIndex: one line per occurrence is no longer true.
DROP INDEX "care_invoice_lines_occurrenceId_key";

-- CreateIndex
CREATE INDEX "care_invoice_lines_occurrenceId_idx" ON "care_invoice_lines"("occurrenceId");

-- CreateIndex: replaces the dropped unique as the idempotency guarantee —
-- regenerating an invoice for the same occurrence cannot duplicate a segment.
CREATE UNIQUE INDEX "care_invoice_lines_invoiceId_occurrenceId_segmentStart_key" ON "care_invoice_lines"("invoiceId", "occurrenceId", "segmentStart");
