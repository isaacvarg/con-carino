-- AlterTable
ALTER TABLE "care_people" ADD COLUMN "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "care_people_email_key" ON "care_people"("email");
