-- AlterTable
ALTER TABLE "account_groups" ADD COLUMN     "isGlobal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "financial_accounts" ADD COLUMN     "isGlobal" BOOLEAN NOT NULL DEFAULT false;
