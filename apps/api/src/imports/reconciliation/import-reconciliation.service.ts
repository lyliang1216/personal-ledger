import { Injectable } from '@nestjs/common'

import { Prisma } from '../../generated/prisma/client'
import {
  ImportReconcileStatus,
  SourceRecordKind,
  TransactionType,
} from '../../generated/prisma/enums'
import { PrismaService } from '../../prisma/prisma.service'
import {
  ReconciliationStatus,
  type ReconciliationResult,
} from '../../transactions/reconciliation.types'
import { TransactionReconciliationService } from '../../transactions/transaction-reconciliation.service'
import type { ImportReconciliationOutcome, NormalizedImportRecord } from '../imports.types'

@Injectable()
export class ImportReconciliationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly transactionReconciliationService: TransactionReconciliationService,
  ) {}

  async reconcile(
    userId: string,
    record: NormalizedImportRecord,
  ): Promise<ImportReconciliationOutcome | null> {
    if (record.reconcileStatus === ImportReconcileStatus.UNSUPPORTED) {
      return {
        reconcileStatus: ImportReconcileStatus.UNSUPPORTED,
        candidateTransactionId: null,
        candidateSourceRecordId: null,
        reconcileReason: null,
        changeReason: null,
      }
    }

    if (
      !record.sourceTransactionTime ||
      !record.sourceAmount ||
      !record.type ||
      !record.sourceRecordKind
    ) {
      return null
    }

    const baseResult = await this.transactionReconciliationService.reconcile(userId, {
      source: record.source,
      sourceTransactionId: record.sourceTransactionId,
      sourceOrderId: record.sourceOrderId,
      sourceTransactionTime: record.sourceTransactionTime,
      sourceAmount: record.sourceAmount,
      type: record.type,
      sourceStatus: record.sourceStatus,
      sourceCategory: record.sourceCategory,
      paymentMethod: record.paymentMethod,
      sourceRecordKind: record.sourceRecordKind,
      fingerprint: record.fingerprint,
      rawData: record.rawData,
    })

    if (
      record.sourceRecordKind === SourceRecordKind.REFUND &&
      baseResult.status !== ReconciliationStatus.UNCHANGED &&
      baseResult.status !== ReconciliationStatus.CHANGED
    ) {
      return this.findRefundCandidate(userId, record)
    }

    return this.mapResult(baseResult, record.normalizationReason)
  }

  private readonly findRefundCandidate = async (
    userId: string,
    record: NormalizedImportRecord,
  ): Promise<ImportReconciliationOutcome> => {
    const sourceAmount = new Prisma.Decimal(record.sourceAmount!)
    const sourceTransactionTime = record.sourceTransactionTime!
    const directConditions: Prisma.TransactionSourceRecordWhereInput[] = []

    if (record.sourceOrderId) directConditions.push({ sourceOrderId: record.sourceOrderId })
    if (record.sourceTransactionId) {
      directConditions.push({ sourceTransactionId: record.sourceTransactionId })
    }

    if (directConditions.length) {
      const directCandidates = await this.prismaService.transactionSourceRecord.findMany({
        where: {
          userId,
          sourceRecordKind: SourceRecordKind.NORMAL,
          sourceTransactionTime: { lt: sourceTransactionTime },
          transaction: { type: TransactionType.EXPENSE },
          OR: directConditions,
        },
        select: { id: true, transactionId: true },
        take: 2,
      })

      if (directCandidates.length === 1) {
        return {
          reconcileStatus: ImportReconcileStatus.POSSIBLE_MATCH,
          candidateTransactionId: directCandidates[0]!.transactionId,
          candidateSourceRecordId: directCandidates[0]!.id,
          reconcileReason: '退款记录通过平台订单字段找到唯一历史消费候选，等待用户确认',
          changeReason: null,
        }
      }
    }

    const amountCandidates = await this.prismaService.transactionSourceRecord.findMany({
      where: {
        userId,
        sourceRecordKind: SourceRecordKind.NORMAL,
        sourceAmount,
        sourceTransactionTime: { lt: sourceTransactionTime },
        transaction: {
          type: TransactionType.EXPENSE,
          ...(record.merchant
            ? { merchant: { equals: record.merchant, mode: 'insensitive' } }
            : {}),
        },
      },
      select: { id: true, transactionId: true, sourceTransactionTime: true },
      orderBy: { sourceTransactionTime: 'desc' },
      take: 2,
    })

    if (amountCandidates.length === 1) {
      return {
        reconcileStatus: ImportReconcileStatus.POSSIBLE_MATCH,
        candidateTransactionId: amountCandidates[0]!.transactionId,
        candidateSourceRecordId: amountCandidates[0]!.id,
        reconcileReason: '退款金额、商户和时间顺序匹配到唯一历史消费候选，等待用户确认',
        changeReason: null,
      }
    }

    return {
      reconcileStatus: ImportReconcileStatus.POSSIBLE_MATCH,
      candidateTransactionId: null,
      candidateSourceRecordId: null,
      reconcileReason:
        amountCandidates.length > 1
          ? '退款记录存在多个同金额历史消费候选，不能自动选择'
          : '退款记录未找到唯一历史消费候选，可由用户关联或作为独立记录导入',
      changeReason: null,
    }
  }

  private readonly mapResult = (
    result: ReconciliationResult,
    normalizationReason: string | null,
  ): ImportReconciliationOutcome => ({
    reconcileStatus: this.mapStatus(result.status),
    candidateTransactionId: result.transactionId || null,
    candidateSourceRecordId: result.sourceRecordId || null,
    reconcileReason: [normalizationReason, result.reason].filter(Boolean).join('；') || null,
    changeReason: result.changeReason || null,
  })

  private readonly mapStatus = (status: ReconciliationStatus): ImportReconcileStatus => {
    const statusMap: Record<ReconciliationStatus, ImportReconcileStatus> = {
      [ReconciliationStatus.NEW]: ImportReconcileStatus.NEW,
      [ReconciliationStatus.UNCHANGED]: ImportReconcileStatus.UNCHANGED,
      [ReconciliationStatus.CHANGED]: ImportReconcileStatus.CHANGED,
      [ReconciliationStatus.AUTO_MATCH]: ImportReconcileStatus.AUTO_MATCH,
      [ReconciliationStatus.POSSIBLE_MATCH]: ImportReconcileStatus.POSSIBLE_MATCH,
      [ReconciliationStatus.UNSUPPORTED]: ImportReconcileStatus.UNSUPPORTED,
    }

    return statusMap[status]
  }
}
