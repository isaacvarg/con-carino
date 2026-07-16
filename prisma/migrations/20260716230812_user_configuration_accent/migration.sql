-- CreateEnum
CREATE TYPE "AppAccent" AS ENUM ('rosewater', 'flamingo', 'pink', 'mauve', 'red', 'maroon', 'peach', 'yellow', 'green', 'teal', 'sky', 'sapphire', 'blue', 'lavender');

-- AlterTable
ALTER TABLE "user_configurations" ADD COLUMN     "accent" "AppAccent" NOT NULL DEFAULT 'flamingo';
