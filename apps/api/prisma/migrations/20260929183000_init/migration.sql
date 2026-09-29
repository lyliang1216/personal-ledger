-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('MANUAL', 'ALIPAY', 'WECHAT', 'JD', 'TAOBAO', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'WECHAT', 'ALIPAY', 'BANK_CARD', 'CREDIT_CARD', 'JD', 'OTHER');

-- CreateEnum
CREATE TYPE "ImportTaskStatus" AS ENUM ('PENDING', 'PARSING', 'PREVIEW', 'IMPORTING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRecordStatus" AS ENUM ('PENDING', 'READY', 'DUPLICATE', 'IGNORED', 'IMPORTED', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "nickname" VARCHAR(100) NOT NULL,
    "avatarUrl" VARCHAR(2048),
    "phone" VARCHAR(32),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ledger" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "AccountType" NOT NULL,
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "parentId" UUID,
    "name" VARCHAR(100) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "icon" VARCHAR(100),
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "transactionTime" TIMESTAMPTZ(3) NOT NULL,
    "merchant" VARCHAR(255),
    "description" TEXT,
    "remark" TEXT,
    "source" "TransactionSource" NOT NULL DEFAULT 'MANUAL',
    "sourceTransactionId" VARCHAR(255),
    "sourceOrderId" VARCHAR(255),
    "fingerprint" VARCHAR(128),
    "accountId" UUID,
    "categoryId" UUID,
    "ledgerId" UUID NOT NULL,
    "rawData" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionTag" (
    "userId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionTag_pkey" PRIMARY KEY ("transactionId","tagId")
);

-- CreateTable
CREATE TABLE "ImportTask" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "source" "TransactionSource" NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "status" "ImportTaskStatus" NOT NULL DEFAULT 'PENDING',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "ignoredCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ImportTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRecord" (
    "id" UUID NOT NULL,
    "importTaskId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "source" "TransactionSource" NOT NULL,
    "sourceTransactionId" VARCHAR(255),
    "sourceOrderId" VARCHAR(255),
    "transactionTime" TIMESTAMPTZ(3) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "merchant" VARCHAR(255),
    "description" TEXT,
    "remark" TEXT,
    "categoryId" UUID,
    "ledgerId" UUID,
    "accountId" UUID,
    "fingerprint" VARCHAR(128),
    "rawData" JSONB NOT NULL,
    "status" "ImportRecordStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRecordTag" (
    "userId" UUID NOT NULL,
    "importRecordId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRecordTag_pkey" PRIMARY KEY ("importRecordId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "Ledger_userId_isDefault_idx" ON "Ledger"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Ledger_id_userId_key" ON "Ledger"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Ledger_userId_name_key" ON "Ledger"("userId", "name");

-- CreateIndex
CREATE INDEX "Account_userId_isActive_idx" ON "Account"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Account_id_userId_key" ON "Account"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_name_key" ON "Account"("userId", "name");

-- CreateIndex
CREATE INDEX "Category_userId_type_isActive_idx" ON "Category"("userId", "type", "isActive");

-- CreateIndex
CREATE INDEX "Category_userId_parentId_sort_idx" ON "Category"("userId", "parentId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_userId_key" ON "Category"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_id_userId_key" ON "Tag"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

-- CreateIndex
CREATE INDEX "Transaction_userId_transactionTime_idx" ON "Transaction"("userId", "transactionTime");

-- CreateIndex
CREATE INDEX "Transaction_userId_ledgerId_transactionTime_idx" ON "Transaction"("userId", "ledgerId", "transactionTime");

-- CreateIndex
CREATE INDEX "Transaction_userId_categoryId_transactionTime_idx" ON "Transaction"("userId", "categoryId", "transactionTime");

-- CreateIndex
CREATE INDEX "Transaction_userId_accountId_transactionTime_idx" ON "Transaction"("userId", "accountId", "transactionTime");

-- CreateIndex
CREATE INDEX "Transaction_userId_source_transactionTime_idx" ON "Transaction"("userId", "source", "transactionTime");

-- CreateIndex
CREATE INDEX "Transaction_userId_fingerprint_idx" ON "Transaction"("userId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_id_userId_key" ON "Transaction"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_userId_source_sourceTransactionId_key" ON "Transaction"("userId", "source", "sourceTransactionId");

-- CreateIndex
CREATE INDEX "TransactionTag_userId_tagId_idx" ON "TransactionTag"("userId", "tagId");

-- CreateIndex
CREATE INDEX "ImportTask_userId_createdAt_idx" ON "ImportTask"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportTask_userId_status_idx" ON "ImportTask"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportTask_id_userId_key" ON "ImportTask"("id", "userId");

-- CreateIndex
CREATE INDEX "ImportRecord_importTaskId_status_idx" ON "ImportRecord"("importTaskId", "status");

-- CreateIndex
CREATE INDEX "ImportRecord_userId_transactionTime_idx" ON "ImportRecord"("userId", "transactionTime");

-- CreateIndex
CREATE INDEX "ImportRecord_userId_source_sourceTransactionId_idx" ON "ImportRecord"("userId", "source", "sourceTransactionId");

-- CreateIndex
CREATE INDEX "ImportRecord_userId_fingerprint_idx" ON "ImportRecord"("userId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRecord_id_userId_key" ON "ImportRecord"("id", "userId");

-- CreateIndex
CREATE INDEX "ImportRecordTag_userId_tagId_idx" ON "ImportRecordTag"("userId", "tagId");

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_userId_fkey" FOREIGN KEY ("parentId", "userId") REFERENCES "Category"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_ledgerId_userId_fkey" FOREIGN KEY ("ledgerId", "userId") REFERENCES "Ledger"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTag" ADD CONSTRAINT "TransactionTag_transactionId_userId_fkey" FOREIGN KEY ("transactionId", "userId") REFERENCES "Transaction"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTag" ADD CONSTRAINT "TransactionTag_tagId_userId_fkey" FOREIGN KEY ("tagId", "userId") REFERENCES "Tag"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportTask" ADD CONSTRAINT "ImportTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_importTaskId_userId_fkey" FOREIGN KEY ("importTaskId", "userId") REFERENCES "ImportTask"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_ledgerId_userId_fkey" FOREIGN KEY ("ledgerId", "userId") REFERENCES "Ledger"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecordTag" ADD CONSTRAINT "ImportRecordTag_importRecordId_userId_fkey" FOREIGN KEY ("importRecordId", "userId") REFERENCES "ImportRecord"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecordTag" ADD CONSTRAINT "ImportRecordTag_tagId_userId_fkey" FOREIGN KEY ("tagId", "userId") REFERENCES "Tag"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
