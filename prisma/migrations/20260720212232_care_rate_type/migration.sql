-- CreateEnum
CREATE TYPE "CareRateType" AS ENUM ('HOURLY', 'DAILY');

-- AlterTable
ALTER TABLE "care_invoice_lines" ADD COLUMN     "rateType" "CareRateType" NOT NULL DEFAULT 'HOURLY';

-- AlterTable
ALTER TABLE "care_people" ADD COLUMN     "rateType" "CareRateType" NOT NULL DEFAULT 'HOURLY';

-- AlterTable
ALTER TABLE "care_person_types" ADD COLUMN     "defaultRateType" "CareRateType" NOT NULL DEFAULT 'HOURLY';
