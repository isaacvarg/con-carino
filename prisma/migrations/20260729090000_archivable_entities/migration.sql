-- Soft delete for the entities an admin can remove. Purely additive: every
-- column is nullable with no default, so existing rows read as "not archived".

-- AlterTable
ALTER TABLE "tags" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "categories" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "payees" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "financial_accounts" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "account_groups" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "care_people" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tags_archivedAt_idx" ON "tags"("archivedAt");
CREATE INDEX "categories_archivedAt_idx" ON "categories"("archivedAt");
CREATE INDEX "payees_archivedAt_idx" ON "payees"("archivedAt");
CREATE INDEX "financial_accounts_archivedAt_idx" ON "financial_accounts"("archivedAt");
CREATE INDEX "account_groups_archivedAt_idx" ON "account_groups"("archivedAt");
CREATE INDEX "care_people_archivedAt_idx" ON "care_people"("archivedAt");
CREATE INDEX "users_archivedAt_idx" ON "users"("archivedAt");
