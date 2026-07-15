-- AlterTable: add new color columns
ALTER TABLE "care_people" ADD COLUMN "bgColor" TEXT,
ADD COLUMN "textColor" TEXT;

-- Preserve existing calendar colors as background; default white text
UPDATE "care_people"
SET "bgColor" = "color",
    "textColor" = '#ffffff'
WHERE "color" IS NOT NULL;

-- Drop old column
ALTER TABLE "care_people" DROP COLUMN "color";
