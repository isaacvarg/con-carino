-- AlterTable
ALTER TABLE "care_coverage_occurrences" ADD COLUMN     "responsiblePersonId" TEXT,
ADD COLUMN     "responsibleSetAt" TIMESTAMP(3),
ADD COLUMN     "responsibleSetByUserId" TEXT;

-- CreateIndex
CREATE INDEX "care_coverage_occurrences_responsiblePersonId_idx" ON "care_coverage_occurrences"("responsiblePersonId");

-- AddForeignKey
ALTER TABLE "care_coverage_occurrences" ADD CONSTRAINT "care_coverage_occurrences_responsiblePersonId_fkey" FOREIGN KEY ("responsiblePersonId") REFERENCES "care_people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
