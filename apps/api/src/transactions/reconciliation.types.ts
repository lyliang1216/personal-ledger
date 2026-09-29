import type { TransactionSource, TransactionType } from '../generated/prisma/enums'

export enum ReconciliationStatus {
  NEW = 'NEW',
  UNCHANGED = 'UNCHANGED',
  CHANGED = 'CHANGED',
  AUTO_MATCH = 'AUTO_MATCH',
  POSSIBLE_MATCH = 'POSSIBLE_MATCH',
  UNSUPPORTED = 'UNSUPPORTED',
}

export interface ReconciliationSourceInput {
  source: TransactionSource
  sourceTransactionId: string | null
  sourceOrderId: string | null
  sourceTransactionTime: Date
  sourceAmount: string
  type: TransactionType
  sourceStatus?: string | null
  sourceCategory?: string | null
  paymentMethod?: string | null
  fingerprint: string | null
  rawData: unknown | null
  isSupported?: boolean
}

export interface ReconciliationResult {
  status: ReconciliationStatus
  transactionId?: string
  sourceRecordId?: string
  candidateTransactionIds: string[]
}
