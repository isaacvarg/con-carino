-- CreateEnum
CREATE TYPE "CareHireStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "care_hire_requests" (
    "id" TEXT NOT NULL,
    "requesterPersonId" TEXT NOT NULL,
    "targetPersonId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "CareHireStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_hire_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_hire_items" (
    "id" TEXT NOT NULL,
    "hireId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,

    CONSTRAINT "care_hire_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_hire_requests_status_idx" ON "care_hire_requests"("status");

-- CreateIndex
CREATE INDEX "care_hire_requests_targetPersonId_status_idx" ON "care_hire_requests"("targetPersonId", "status");

-- CreateIndex
CREATE INDEX "care_hire_requests_requestedByUserId_idx" ON "care_hire_requests"("requestedByUserId");

-- CreateIndex
CREATE INDEX "care_hire_items_occurrenceId_idx" ON "care_hire_items"("occurrenceId");

-- CreateIndex
CREATE UNIQUE INDEX "care_hire_items_hireId_occurrenceId_key" ON "care_hire_items"("hireId", "occurrenceId");

-- AddForeignKey
ALTER TABLE "care_hire_requests" ADD CONSTRAINT "care_hire_requests_requesterPersonId_fkey" FOREIGN KEY ("requesterPersonId") REFERENCES "care_people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_hire_requests" ADD CONSTRAINT "care_hire_requests_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "care_people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_hire_requests" ADD CONSTRAINT "care_hire_requests_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_hire_requests" ADD CONSTRAINT "care_hire_requests_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_hire_items" ADD CONSTRAINT "care_hire_items_hireId_fkey" FOREIGN KEY ("hireId") REFERENCES "care_hire_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_hire_items" ADD CONSTRAINT "care_hire_items_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "care_coverage_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
