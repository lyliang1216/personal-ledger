import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Prisma } from '../../src/generated/prisma/client'
import {
  SourceRecordKind,
  TransactionSource,
  TransactionType,
} from '../../src/generated/prisma/enums'
import type { PrismaService } from '../../src/prisma/prisma.service'
import { ReconciliationStatus } from '../../src/transactions/reconciliation.types'
import { TransactionReconciliationService } from '../../src/transactions/transaction-reconciliation.service'

test('同平台 sourceTransactionId 单字段相同不能误判为 CHANGED', async () => {
  let sourceQueryCount = 0
  const prismaService = {
    transactionSourceRecord: {
      findMany: async () => {
        sourceQueryCount += 1
        if (sourceQueryCount > 1) return []

        return [
          {
            id: 'source-record-1',
            userId: 'user-1',
            transactionId: 'transaction-1',
            source: TransactionSource.JD,
            sourceTransactionId: 'JD-SHARED-ID',
            sourceOrderId: 'OLD-ORDER',
            sourceTransactionTime: new Date('2026-09-20T10:00:00+08:00'),
            sourceAmount: new Prisma.Decimal('10.00'),
            sourceStatus: '退款成功',
            sourceCategory: '退款',
            paymentMethod: '京东白条',
            sourceRecordKind: SourceRecordKind.REFUND,
            fingerprint: 'old-fingerprint',
            rawData: { row: 'old' },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]
      },
    },
    transaction: { findMany: async () => [] },
  } as unknown as PrismaService
  const service = new TransactionReconciliationService(prismaService)

  const result = await service.reconcile('user-1', {
    source: TransactionSource.JD,
    sourceTransactionId: 'JD-SHARED-ID',
    sourceOrderId: 'NEW-ORDER',
    sourceTransactionTime: new Date('2026-09-20T10:10:00+08:00'),
    sourceAmount: '20.00',
    type: TransactionType.INCOME,
    sourceStatus: '退款成功',
    sourceCategory: '退款',
    paymentMethod: '京东白条',
    sourceRecordKind: SourceRecordKind.REFUND,
    fingerprint: 'new-fingerprint',
    rawData: { row: 'new' },
  })

  assert.equal(result.status, ReconciliationStatus.NEW)
  assert.equal(result.transactionId, undefined)
})
