-- CreateTable
CREATE TABLE "care_event_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bgColor" TEXT NOT NULL,
    "textColor" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_event_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "care_event_types_name_key" ON "care_event_types"("name");

-- Seed the default event types (previously hard-coded enum values), each with a
-- distinct calendar appearance.
INSERT INTO "care_event_types" ("id", "name", "bgColor", "textColor", "sortOrder", "createdAt", "updatedAt")
VALUES
    (gen_random_uuid(), 'Appointment', '#f59e0b', '#ffffff', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Family', '#8b5cf6', '#ffffff', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Other', '#64748b', '#ffffff', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Add the new relation column (nullable during backfill).
ALTER TABLE "care_calendar_events" ADD COLUMN "typeId" TEXT;

-- Backfill existing events from their previous enum "kind".
UPDATE "care_calendar_events" e
SET "typeId" = t."id"
FROM "care_event_types" t
WHERE (e."kind" = 'APPOINTMENT' AND t."name" = 'Appointment')
   OR (e."kind" = 'FAMILY' AND t."name" = 'Family')
   OR (e."kind" = 'OTHER' AND t."name" = 'Other');

-- Safety net: anything unmatched falls back to "Other".
UPDATE "care_calendar_events"
SET "typeId" = (SELECT "id" FROM "care_event_types" WHERE "name" = 'Other')
WHERE "typeId" IS NULL;

-- Enforce the relation and drop the old enum column + type.
ALTER TABLE "care_calendar_events" ALTER COLUMN "typeId" SET NOT NULL;
ALTER TABLE "care_calendar_events" DROP COLUMN "kind";
DROP TYPE "CareCalendarEventKind";

-- CreateIndex
CREATE INDEX "care_calendar_events_typeId_idx" ON "care_calendar_events"("typeId");

-- AddForeignKey
ALTER TABLE "care_calendar_events" ADD CONSTRAINT "care_calendar_events_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "care_event_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
