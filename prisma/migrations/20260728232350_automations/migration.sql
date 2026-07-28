-- CreateEnum
CREATE TYPE "AutomationKind" AS ENUM ('DUPLICATE_TO_ACCOUNT', 'PERCENT_MATCH', 'LOW_BALANCE_ALERT');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('APPLIED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "createdByAutomationId" TEXT;

-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AutomationKind" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "triggerAccountId" TEXT NOT NULL,
    "triggerType" "TransactionType",
    "triggerCategoryId" TEXT,
    "targetAccountId" TEXT,
    "percent" DECIMAL(9,4),
    "thresholdAmount" DECIMAL(19,4),
    "notifyUserId" TEXT,
    "alertingSince" TIMESTAMP(3),
    "lastAlertedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "sourceTransactionId" TEXT,
    "createdTransactionId" TEXT,
    "status" "AutomationRunStatus" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AutomationToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AutomationToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "automations_kind_isEnabled_idx" ON "automations"("kind", "isEnabled");

-- CreateIndex
CREATE INDEX "automations_triggerAccountId_isEnabled_idx" ON "automations"("triggerAccountId", "isEnabled");

-- CreateIndex
CREATE INDEX "automations_targetAccountId_idx" ON "automations"("targetAccountId");

-- CreateIndex
CREATE INDEX "automations_triggerCategoryId_idx" ON "automations"("triggerCategoryId");

-- CreateIndex
CREATE INDEX "automations_notifyUserId_idx" ON "automations"("notifyUserId");

-- CreateIndex
CREATE INDEX "automations_createdByUserId_idx" ON "automations"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "automation_runs_createdTransactionId_key" ON "automation_runs"("createdTransactionId");

-- CreateIndex
CREATE INDEX "automation_runs_automationId_createdAt_idx" ON "automation_runs"("automationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "automation_runs_automationId_sourceTransactionId_key" ON "automation_runs"("automationId", "sourceTransactionId");

-- CreateIndex
CREATE INDEX "_AutomationToTag_B_index" ON "_AutomationToTag"("B");

-- CreateIndex
CREATE INDEX "transactions_createdByAutomationId_idx" ON "transactions"("createdByAutomationId");

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_triggerAccountId_fkey" FOREIGN KEY ("triggerAccountId") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_triggerCategoryId_fkey" FOREIGN KEY ("triggerCategoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_notifyUserId_fkey" FOREIGN KEY ("notifyUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_createdTransactionId_fkey" FOREIGN KEY ("createdTransactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_createdByAutomationId_fkey" FOREIGN KEY ("createdByAutomationId") REFERENCES "automations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AutomationToTag" ADD CONSTRAINT "_AutomationToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AutomationToTag" ADD CONSTRAINT "_AutomationToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The `kind` discriminator decides which nullable columns are required. Prisma
-- cannot express that, so it lives here, alongside the partial unique index in
-- the care_contributions migration. `parseAutomationInput` enforces the same
-- shape with a readable error before a write ever reaches Postgres; this is the
-- backstop that keeps a malformed row from existing at all.
ALTER TABLE "automations" ADD CONSTRAINT "automations_kind_shape_check" CHECK (
  (
    "kind" IN ('DUPLICATE_TO_ACCOUNT', 'PERCENT_MATCH')
    AND "triggerType" IS NOT NULL
    AND "targetAccountId" IS NOT NULL
    AND "thresholdAmount" IS NULL
    AND "notifyUserId" IS NULL
  ) OR (
    "kind" = 'LOW_BALANCE_ALERT'
    AND "thresholdAmount" IS NOT NULL
    AND "notifyUserId" IS NOT NULL
    AND "targetAccountId" IS NULL
    AND "percent" IS NULL
  )
);

ALTER TABLE "automations" ADD CONSTRAINT "automations_percent_check" CHECK (
  ("kind" <> 'PERCENT_MATCH' AND "percent" IS NULL)
  OR ("kind" = 'PERCENT_MATCH' AND "percent" > 0 AND "percent" <= 100)
);
