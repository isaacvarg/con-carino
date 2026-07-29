-- Optional organizational week on transactions, plus the household setting that
-- decides where a week starts.
--
-- Purely additive: no backfill and no existing row is rewritten. `weekStartsOn`
-- defaults to 0 (Sunday), which is what every week boundary in the app already
-- hardcoded, so nothing moves until someone changes the setting.

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "weekStart" TEXT;

-- CreateIndex
CREATE INDEX "transactions_weekStart_idx" ON "transactions"("weekStart");

-- AlterTable
ALTER TABLE "care_settings" ADD COLUMN "weekStartsOn" INTEGER NOT NULL DEFAULT 0;
