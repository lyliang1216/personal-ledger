BEGIN;

LOCK TABLE "Transaction" IN ACCESS EXCLUSIVE MODE;

CREATE TABLE "TransactionSourceRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "source" "TransactionSource" NOT NULL,
    "sourceTransactionId" VARCHAR(255),
    "sourceOrderId" VARCHAR(255),
    "sourceTransactionTime" TIMESTAMPTZ(3) NOT NULL,
    "sourceAmount" DECIMAL(19,4) NOT NULL,
    "sourceStatus" VARCHAR(255),
    "sourceCategory" VARCHAR(255),
    "paymentMethod" VARCHAR(255),
    "fingerprint" VARCHAR(128),
    "rawData" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransactionSourceRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TransactionSourceRecord_transactionId_idx"
ON "TransactionSourceRecord"("transactionId");

CREATE INDEX "TransactionSourceRecord_userId_source_sourceTransactionId_idx"
ON "TransactionSourceRecord"("userId", "source", "sourceTransactionId");

CREATE INDEX "TransactionSourceRecord_userId_source_sourceOrderId_idx"
ON "TransactionSourceRecord"("userId", "source", "sourceOrderId");

CREATE INDEX "TransactionSourceRecord_userId_source_sourceTransactionTime_sourceAmount_idx"
ON "TransactionSourceRecord"("userId", "source", "sourceTransactionTime", "sourceAmount");

CREATE INDEX "TransactionSourceRecord_userId_fingerprint_idx"
ON "TransactionSourceRecord"("userId", "fingerprint");

ALTER TABLE "TransactionSourceRecord"
ADD CONSTRAINT "TransactionSourceRecord_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TransactionSourceRecord"
ADD CONSTRAINT "TransactionSourceRecord_transactionId_userId_fkey"
FOREIGN KEY ("transactionId", "userId") REFERENCES "Transaction"("id", "userId")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TransactionSourceRecord" (
    "id",
    "userId",
    "transactionId",
    "source",
    "sourceTransactionId",
    "sourceOrderId",
    "sourceTransactionTime",
    "sourceAmount",
    "fingerprint",
    "rawData",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    "userId",
    "id",
    "source",
    "sourceTransactionId",
    "sourceOrderId",
    "transactionTime",
    "amount",
    "fingerprint",
    "rawData",
    "createdAt",
    "updatedAt"
FROM "Transaction";

DO $$
BEGIN
    IF (SELECT COUNT(*) FROM "TransactionSourceRecord")
       <> (SELECT COUNT(*) FROM "Transaction") THEN
        RAISE EXCEPTION 'Transaction source backfill count mismatch';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "Transaction" AS transaction
        LEFT JOIN "TransactionSourceRecord" AS source_record
          ON source_record."transactionId" = transaction."id"
         AND source_record."userId" = transaction."userId"
        WHERE source_record."id" IS NULL
           OR source_record."source" IS DISTINCT FROM transaction."source"
           OR source_record."sourceTransactionId" IS DISTINCT FROM transaction."sourceTransactionId"
           OR source_record."sourceOrderId" IS DISTINCT FROM transaction."sourceOrderId"
           OR source_record."sourceTransactionTime" IS DISTINCT FROM transaction."transactionTime"
           OR source_record."sourceAmount" IS DISTINCT FROM transaction."amount"
           OR source_record."fingerprint" IS DISTINCT FROM transaction."fingerprint"
           OR source_record."rawData" IS DISTINCT FROM transaction."rawData"
    ) THEN
        RAISE EXCEPTION 'Transaction source backfill data verification failed';
    END IF;
END $$;

DROP INDEX "Transaction_userId_source_transactionTime_idx";
DROP INDEX "Transaction_userId_fingerprint_idx";
DROP INDEX "Transaction_userId_source_sourceTransactionId_key";

ALTER TABLE "Transaction"
    DROP COLUMN "source",
    DROP COLUMN "sourceTransactionId",
    DROP COLUMN "sourceOrderId",
    DROP COLUMN "fingerprint",
    DROP COLUMN "rawData";

COMMIT;
