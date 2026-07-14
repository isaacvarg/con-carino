-- CreateEnum
CREATE TYPE "CareCoverageNeed" AS ENUM ('FULL', 'PARTIAL');

-- CreateEnum
CREATE TYPE "CareCoverageWindowKind" AS ENUM ('ALL_DAY', 'SHIFTS');

-- AlterTable
ALTER TABLE "care_coverage_series" ADD COLUMN     "isRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiredKey" TEXT;

-- AlterTable
ALTER TABLE "care_settings" ADD COLUMN     "coverageNeed" "CareCoverageNeed" NOT NULL DEFAULT 'FULL',
ADD COLUMN     "coverageWindowKind" "CareCoverageWindowKind" NOT NULL DEFAULT 'ALL_DAY',
ADD COLUMN     "partialDaysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "care_required_shifts" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL DEFAULT 'default',
    "label" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_required_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_required_shifts_settingsId_sortOrder_idx" ON "care_required_shifts"("settingsId", "sortOrder");

-- CreateIndex
CREATE INDEX "care_coverage_series_isRequired_idx" ON "care_coverage_series"("isRequired");

-- CreateIndex
CREATE UNIQUE INDEX "care_coverage_series_requiredKey_key" ON "care_coverage_series"("requiredKey");

-- AddForeignKey
ALTER TABLE "care_required_shifts" ADD CONSTRAINT "care_required_shifts_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "care_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
