import type { Prisma } from '../generated/prisma/client'
import type {
  ImportRecordStatus,
  ImportReconcileStatus,
  SourceRecordKind,
  TransactionSource,
  TransactionType,
} from '../generated/prisma/enums'

export interface UploadedBillFile {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

export interface BillParserInput {
  fileName: string
  mimeType: string
  buffer: Buffer
}

export interface NormalizedImportRecord {
  source: TransactionSource
  transactionTime: Date | null
  type: TransactionType | null
  amount: string | null
  merchant: string | null
  description: string | null
  remark: string | null
  sourceTransactionId: string | null
  sourceOrderId: string | null
  sourceTransactionTime: Date | null
  sourceAmount: string | null
  sourceStatus: string | null
  sourceCategory: string | null
  paymentMethod: string | null
  sourceRecordKind: SourceRecordKind | null
  fingerprint: string | null
  status: ImportRecordStatus
  reconcileStatus: ImportReconcileStatus | null
  normalizationReason: string | null
  parserWarnings: string[]
  rawData: Prisma.InputJsonObject
}

export interface ParsedBill {
  source: TransactionSource
  records: NormalizedImportRecord[]
}

export interface ImportReconciliationOutcome {
  reconcileStatus: ImportReconcileStatus
  candidateTransactionId: string | null
  candidateSourceRecordId: string | null
  reconcileReason: string | null
  changeReason: string | null
}
