BEGIN;

CREATE TYPE "ImportReconcileStatus" AS ENUM (
    'NEW',
    'UNCHANGED',
    'CHANGED',
    'AUTO_MATCH',
    'POSSIBLE_MATCH',
    'UNSUPPORTED'
);

CREATE TYPE "ImportRecordDecision" AS ENUM (
    'PENDING',
    'CREATE_NEW',
    'LINK_EXISTING',
    'APPLY_CHANGE'
);

CREATE TYPE "SourceRecordKind" AS ENUM ('NORMAL', 'REFUND');

ALTER TABLE "ImportTask"
ADD COLUMN "errorMessage" TEXT;

ALTER TABLE "TransactionSourceRecord"
ADD COLUMN "sourceRecordKind" "SourceRecordKind" NOT NULL DEFAULT 'NORMAL';

ALTER TABLE "ImportRecord"
    ADD COLUMN "sourceTransactionTime" TIMESTAMPTZ(3),
    ADD COLUMN "sourceAmount" DECIMAL(19,4),
    ADD COLUMN "sourceStatus" VARCHAR(255),
    ADD COLUMN "sourceCategory" VARCHAR(255),
    ADD COLUMN "paymentMethod" VARCHAR(255),
    ADD COLUMN "sourceRecordKind" "SourceRecordKind",
    ADD COLUMN "reconcileStatus" "ImportReconcileStatus",
    ADD COLUMN "decision" "ImportRecordDecision" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "candidateTransactionId" UUID,
    ADD COLUMN "candidateSourceRecordId" UUID,
    ADD COLUMN "reconcileReason" TEXT,
    ADD COLUMN "changeReason" TEXT,
    ADD COLUMN "parserWarnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "ImportRecord"
SET "sourceTransactionTime" = "transactionTime"
WHERE "transactionTime" IS NOT NULL;

UPDATE "ImportRecord"
SET "sourceAmount" = "amount"
WHERE "amount" IS NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "ImportRecord"
        WHERE "transactionTime" IS NOT NULL
          AND "sourceTransactionTime" IS DISTINCT FROM "transactionTime"
    ) THEN
        RAISE EXCEPTION 'ImportRecord sourceTransactionTime backfill verification failed';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "ImportRecord"
        WHERE "amount" IS NOT NULL
          AND "sourceAmount" IS DISTINCT FROM "amount"
    ) THEN
        RAISE EXCEPTION 'ImportRecord sourceAmount backfill verification failed';
    END IF;
END $$;

ALTER TABLE "ImportRecord"
    ALTER COLUMN "transactionTime" DROP NOT NULL,
    ALTER COLUMN "amount" DROP NOT NULL,
    ALTER COLUMN "type" DROP NOT NULL;

CREATE INDEX "ImportRecord_importTaskId_reconcileStatus_idx"
ON "ImportRecord"("importTaskId", "reconcileStatus");

CREATE INDEX "ImportRecord_userId_candidateTransactionId_idx"
ON "ImportRecord"("userId", "candidateTransactionId");

CREATE INDEX "ImportRecord_userId_candidateSourceRecordId_idx"
ON "ImportRecord"("userId", "candidateSourceRecordId");

ALTER TABLE "ImportRecord"
ADD CONSTRAINT "ImportRecord_candidateTransactionId_fkey"
FOREIGN KEY ("candidateTransactionId") REFERENCES "Transaction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ImportRecord"
ADD CONSTRAINT "ImportRecord_candidateSourceRecordId_fkey"
FOREIGN KEY ("candidateSourceRecordId") REFERENCES "TransactionSourceRecord"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
