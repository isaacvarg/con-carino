-- Additive only: a new table, nothing existing is altered or backfilled.

-- CreateTable
CREATE TABLE "user_emails" (
    "email" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_emails_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE INDEX "user_emails_userId_idx" ON "user_emails"("userId");

-- AddForeignKey
ALTER TABLE "user_emails" ADD CONSTRAINT "user_emails_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
