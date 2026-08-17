-- AlterTable
ALTER TABLE "care_settings" ADD COLUMN     "calendarHireLabel" TEXT NOT NULL DEFAULT '%originalUser hired %employedUser',
ADD COLUMN     "calendarShowHireOrigin" BOOLEAN NOT NULL DEFAULT true;
