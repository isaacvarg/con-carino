-- CreateEnum
CREATE TYPE "AppTheme" AS ENUM ('latte', 'macchiato');

-- CreateTable
CREATE TABLE "user_configurations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theme" "AppTheme" NOT NULL DEFAULT 'latte',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_configurations_userId_key" ON "user_configurations"("userId");

-- AddForeignKey
ALTER TABLE "user_configurations" ADD CONSTRAINT "user_configurations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
