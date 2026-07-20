-- CreateEnum
CREATE TYPE "CareAssignmentScope" AS ENUM ('ALL_SHIFTS', 'SPECIFIC_SHIFTS');

-- AlterTable
ALTER TABLE "care_coverage_occurrences" ADD COLUMN     "assignedByRuleId" TEXT;

-- AlterTable
ALTER TABLE "care_coverage_series" ADD COLUMN     "requiredShiftId" TEXT;

-- CreateTable
CREATE TABLE "care_coverage_assignment_rules" (
    "id" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "daysOfWeek" INTEGER[],
    "scope" "CareAssignmentScope" NOT NULL DEFAULT 'ALL_SHIFTS',
    "shiftIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_coverage_assignment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_coverage_assignment_rules_assigneeId_idx" ON "care_coverage_assignment_rules"("assigneeId");

-- CreateIndex
CREATE INDEX "care_coverage_occurrences_assignedByRuleId_idx" ON "care_coverage_occurrences"("assignedByRuleId");

-- CreateIndex
CREATE INDEX "care_coverage_series_requiredShiftId_idx" ON "care_coverage_series"("requiredShiftId");

-- AddForeignKey
ALTER TABLE "care_coverage_series" ADD CONSTRAINT "care_coverage_series_requiredShiftId_fkey" FOREIGN KEY ("requiredShiftId") REFERENCES "care_required_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_coverage_occurrences" ADD CONSTRAINT "care_coverage_occurrences_assignedByRuleId_fkey" FOREIGN KEY ("assignedByRuleId") REFERENCES "care_coverage_assignment_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_coverage_assignment_rules" ADD CONSTRAINT "care_coverage_assignment_rules_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "care_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
