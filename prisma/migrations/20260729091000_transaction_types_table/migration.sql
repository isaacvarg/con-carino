-- Replace the TransactionType enum with a table so admins can add and rename
-- types without a migration.
--
-- Amounts are stored already-signed and this migration must not touch them.
-- The backfill only maps the old enum text onto a row id; every `amount` stays
-- byte-identical. The `SET NOT NULL` below is the safety net: if any row failed
-- to map, the migration aborts rather than leaving a typeless transaction.

-- CreateEnum
CREATE TYPE "TransactionSign" AS ENUM ('NEGATIVE', 'POSITIVE', 'DIRECTIONAL');

-- CreateTable
CREATE TABLE "transaction_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sign" "TransactionSign" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transaction_types_key_key" ON "transaction_types"("key");
CREATE INDEX "transaction_types_archivedAt_idx" ON "transaction_types"("archivedAt");

-- Seed the eight former enum members. Signs are transcribed from the switch
-- that used to live in src/lib/transaction-amount.ts. Ids are fixed literals
-- rather than gen_random_uuid() so they are identical across installs and need
-- no pgcrypto. sortOrder reproduces the old dropdown order, with TRANSFER last
-- because it is never offered in the plain transaction form.
INSERT INTO "transaction_types" ("id", "key", "label", "sign", "isSystem", "sortOrder", "updatedAt") VALUES
  ('00000000-0000-4000-8000-000000000001', 'EXPENSE',            'Expense',            'NEGATIVE',    true, 0, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000007', 'WITHDRAWAL',         'Withdrawal',         'NEGATIVE',    true, 1, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000008', 'DEPOSIT',            'Deposit',            'POSITIVE',    true, 2, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000002', 'INCOME',             'Income',             'POSITIVE',    true, 3, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000004', 'BALANCE_ADJUSTMENT', 'Balance adjustment', 'DIRECTIONAL', true, 4, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000005', 'REFUND',             'Refund',             'POSITIVE',    true, 5, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000006', 'REIMBURSEMENT',      'Reimbursement',      'POSITIVE',    true, 6, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000003', 'TRANSFER',           'Transfer',           'DIRECTIONAL', true, 7, CURRENT_TIMESTAMP);

-- AlterTable: transactions.type -> transactions.typeId
ALTER TABLE "transactions" ADD COLUMN "typeId" TEXT;

UPDATE "transactions" t
SET "typeId" = tt."id"
FROM "transaction_types" tt
WHERE tt."key" = t."type"::text;

ALTER TABLE "transactions" ALTER COLUMN "typeId" SET NOT NULL;

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_typeId_fkey"
  FOREIGN KEY ("typeId") REFERENCES "transaction_types"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "transactions_typeId_idx" ON "transactions"("typeId");

ALTER TABLE "transactions" DROP COLUMN "type";

-- AlterTable: automations.triggerType -> automations.triggerTypeId
ALTER TABLE "automations" ADD COLUMN "triggerTypeId" TEXT;

UPDATE "automations" a
SET "triggerTypeId" = tt."id"
FROM "transaction_types" tt
WHERE tt."key" = a."triggerType"::text;

-- The kind-shape CHECK names the old column, so it has to be rebuilt rather
-- than left to break the DROP COLUMN below.
ALTER TABLE "automations" DROP CONSTRAINT "automations_kind_shape_check";

ALTER TABLE "automations" DROP COLUMN "triggerType";

ALTER TABLE "automations"
  ADD CONSTRAINT "automations_triggerTypeId_fkey"
  FOREIGN KEY ("triggerTypeId") REFERENCES "transaction_types"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "automations_triggerTypeId_idx" ON "automations"("triggerTypeId");

ALTER TABLE "automations" ADD CONSTRAINT "automations_kind_shape_check" CHECK (
  (
    "kind" IN ('DUPLICATE_TO_ACCOUNT', 'PERCENT_MATCH')
    AND "triggerTypeId" IS NOT NULL
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

-- DropEnum
DROP TYPE "TransactionType";
