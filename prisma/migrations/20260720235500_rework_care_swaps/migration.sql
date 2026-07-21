-- Swaps are reworked from a single relinquish/claim pair into a person-to-person
-- request with any number of TAKE/GIVE windows. The old rows cannot express the
-- new semantics, so they are dropped rather than migrated.
DELETE FROM "care_swap_requests";

-- CreateEnum
CREATE TYPE "CareSwapItemRole" AS ENUM ('TAKE', 'GIVE');

-- DropForeignKey
ALTER TABLE "care_swap_requests" DROP CONSTRAINT "care_swap_requests_relinquishOccurrenceId_fkey";

-- DropForeignKey
ALTER TABLE "care_swap_requests" DROP CONSTRAINT "care_swap_requests_claimOccurrenceId_fkey";

-- DropForeignKey
ALTER TABLE "care_swap_requests" DROP CONSTRAINT "care_swap_requests_claimForPersonId_fkey";

-- AlterTable
ALTER TABLE "care_swap_requests"
  DROP COLUMN "relinquishOccurrenceId",
  DROP COLUMN "claimOccurrenceId",
  DROP COLUMN "claimForPersonId",
  ADD COLUMN "requesterPersonId" TEXT NOT NULL,
  ADD COLUMN "targetPersonId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "care_swap_items" (
    "id" TEXT NOT NULL,
    "swapId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "role" "CareSwapItemRole" NOT NULL,

    CONSTRAINT "care_swap_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_swap_items_occurrenceId_idx" ON "care_swap_items"("occurrenceId");

-- CreateIndex
CREATE UNIQUE INDEX "care_swap_items_swapId_occurrenceId_key" ON "care_swap_items"("swapId", "occurrenceId");

-- CreateIndex
CREATE INDEX "care_swap_requests_targetPersonId_status_idx" ON "care_swap_requests"("targetPersonId", "status");

-- AddForeignKey
ALTER TABLE "care_swap_requests" ADD CONSTRAINT "care_swap_requests_requesterPersonId_fkey" FOREIGN KEY ("requesterPersonId") REFERENCES "care_people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_swap_requests" ADD CONSTRAINT "care_swap_requests_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "care_people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_swap_items" ADD CONSTRAINT "care_swap_items_swapId_fkey" FOREIGN KEY ("swapId") REFERENCES "care_swap_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_swap_items" ADD CONSTRAINT "care_swap_items_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "care_coverage_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
