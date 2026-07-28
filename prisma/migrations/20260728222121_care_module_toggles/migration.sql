-- CreateEnum
CREATE TYPE "CareInvoicingMode" AS ENUM ('OFF', 'SIMPLE', 'ADVANCED');

-- AlterTable
ALTER TABLE "care_settings" ADD COLUMN     "contributionsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "invoicingMode" "CareInvoicingMode" NOT NULL DEFAULT 'ADVANCED';
