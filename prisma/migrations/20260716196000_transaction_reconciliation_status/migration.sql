-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('UNCLEARED', 'CLEARED', 'NEEDS_REVIEW', 'RECONCILED');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "reconciliationStatus" "ReconciliationStatus" NOT NULL DEFAULT 'UNCLEARED';
ALTER TABLE "transactions" ADD COLUMN "reconciliationUpdatedAt" TIMESTAMP(3);
ALTER TABLE "transactions" ADD COLUMN "reconciliationUpdatedById" TEXT;

-- CreateIndex
CREATE INDEX "transactions_financialAccountId_reconciliationStatus_idx" ON "transactions"("financialAccountId", "reconciliationStatus");

-- CreateIndex
CREATE INDEX "transactions_reconciliationUpdatedById_idx" ON "transactions"("reconciliationUpdatedById");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reconciliationUpdatedById_fkey" FOREIGN KEY ("reconciliationUpdatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
