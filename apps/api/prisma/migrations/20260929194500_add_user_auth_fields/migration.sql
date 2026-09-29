-- AlterTable
ALTER TABLE "User"
ADD COLUMN "username" VARCHAR(100),
ADD COLUMN "passwordHash" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
