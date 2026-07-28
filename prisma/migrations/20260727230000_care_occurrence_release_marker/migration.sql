-- AlterTable
ALTER TABLE "care_coverage_occurrences" ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "releasedByPersonId" TEXT;

-- CreateIndex
CREATE INDEX "care_coverage_occurrences_releasedByPersonId_idx" ON "care_coverage_occurrences"("releasedByPersonId");

-- AddForeignKey
ALTER TABLE "care_coverage_occurrences" ADD CONSTRAINT "care_coverage_occurrences_releasedByPersonId_fkey" FOREIGN KEY ("releasedByPersonId") REFERENCES "care_people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
