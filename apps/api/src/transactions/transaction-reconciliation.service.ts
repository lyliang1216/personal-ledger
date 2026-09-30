import { Injectable } from '@nestjs/common'

import { Prisma } from '../generated/prisma/client'
import { TransactionSource } from '../generated/prisma/enums'
import { PrismaService } from '../prisma/prisma.service'
import {
  ReconciliationStatus,
  type ReconciliationResult,
  type ReconciliationSourceInput,
} from './reconciliation.types'

const REAL_PLATFORM_SOURCES = [
  TransactionSource.ALIPAY,
  TransactionSource.WECHAT,
  TransactionSource.JD,
  TransactionSource.TAOBAO,
] as const

const AUTO_MATCH_WINDOW_MS = 60_000
const POSSIBLE_MATCH_WINDOW_MS = 10 * 60_000

@Injectable()
export class TransactionReconciliationService {
  constructor(private readonly prismaService: PrismaService) {}

  async reconcile(userId: string, input: ReconciliationSourceInput): Promise<ReconciliationResult> {
    if (input.isSupported === false) {
      return this.createResult(
        ReconciliationStatus.UNSUPPORTED,
        '来源记录包含当前规则无法安全解释的内容',
      )
    }

    const sourceTime = input.sourceTransactionTime
    if (Number.isNaN(sourceTime.getTime())) {
      return this.createResult(ReconciliationStatus.UNSUPPORTED, '来源交易时间格式无效')
    }

    let sourceAmount: Prisma.Decimal
    try {
      sourceAmount = new Prisma.Decimal(input.sourceAmount)
    } catch (_error) {
      return this.createResult(ReconciliationStatus.UNSUPPORTED, '来源金额格式无效')
    }

    const existingSource = await this.findExistingSource(userId, input)
    if (existingSource) {
      const changedFields = this.getChangedFields(existingSource, input, sourceAmount)
      const unchanged = changedFields.length === 0

      return {
        status: unchanged ? ReconciliationStatus.UNCHANGED : ReconciliationStatus.CHANGED,
        transactionId: existingSource.transactionId,
        sourceRecordId: existingSource.id,
        candidateTransactionIds: [existingSource.transactionId],
        reason: unchanged
          ? '已确认是同一平台来源，平台事实未发生变化'
          : '已确认是同一平台来源，但平台事实发生变化',
        ...(unchanged ? {} : { changeReason: `发生变化的字段：${changedFields.join('、')}` }),
      }
    }

    if (!this.isRealPlatformSource(input.source)) {
      return this.createResult(ReconciliationStatus.NEW, '当前来源不参与跨平台自动匹配')
    }

    const rangeStart = new Date(sourceTime.getTime() - POSSIBLE_MATCH_WINDOW_MS)
    const rangeEnd = new Date(sourceTime.getTime() + POSSIBLE_MATCH_WINDOW_MS)
    const differentPlatformSources = REAL_PLATFORM_SOURCES.filter(
      (source) => source !== input.source,
    )
    const sourceCandidates = await this.prismaService.transactionSourceRecord.findMany({
      where: {
        userId,
        source: { in: differentPlatformSources },
        sourceAmount,
        sourceTransactionTime: { gte: rangeStart, lte: rangeEnd },
        transaction: { type: input.type },
      },
      select: {
        id: true,
        source: true,
        transactionId: true,
        sourceTransactionTime: true,
      },
    })

    const sourceCandidateDifferences = new Map<
      string,
      { difference: number; sourceRecordId: string; source: TransactionSource }
    >()
    sourceCandidates.forEach((candidate) => {
      const difference = Math.abs(candidate.sourceTransactionTime.getTime() - sourceTime.getTime())
      const current = sourceCandidateDifferences.get(candidate.transactionId)

      if (!current || difference < current.difference) {
        sourceCandidateDifferences.set(candidate.transactionId, {
          difference,
          sourceRecordId: candidate.id,
          source: candidate.source,
        })
      }
    })

    const manualCandidates = await this.prismaService.transaction.findMany({
      where: {
        userId,
        type: input.type,
        amount: sourceAmount,
        transactionTime: { gte: rangeStart, lte: rangeEnd },
        sourceRecords: {
          some: { source: TransactionSource.MANUAL },
          every: { source: TransactionSource.MANUAL },
        },
      },
      select: {
        id: true,
        sourceRecords: {
          where: { source: TransactionSource.MANUAL },
          select: { id: true },
          take: 1,
        },
      },
    })

    const realCandidateIds = [...sourceCandidateDifferences.keys()]
    const manualCandidateIds = manualCandidates.map((candidate) => candidate.id)
    const candidateTransactionIds = [...new Set([...realCandidateIds, ...manualCandidateIds])]

    if (
      realCandidateIds.length === 1 &&
      manualCandidateIds.length === 0 &&
      sourceCandidateDifferences.get(realCandidateIds[0]!)!.difference <= AUTO_MATCH_WINDOW_MS
    ) {
      const candidate = sourceCandidateDifferences.get(realCandidateIds[0]!)!
      return {
        status: ReconciliationStatus.AUTO_MATCH,
        transactionId: realCandidateIds[0],
        sourceRecordId: candidate.sourceRecordId,
        candidateTransactionIds,
        reason: `金额相同，跨平台 ${candidate.source}/${input.source}，时间差${Math.round(candidate.difference / 1000)}秒，且只有一个候选`,
      }
    }

    if (candidateTransactionIds.length > 0) {
      const onlyCandidateId =
        candidateTransactionIds.length === 1 ? candidateTransactionIds[0] : null
      const realCandidate = onlyCandidateId
        ? sourceCandidateDifferences.get(onlyCandidateId)
        : undefined
      const manualCandidate = onlyCandidateId
        ? manualCandidates.find((candidate) => candidate.id === onlyCandidateId)
        : undefined

      return {
        status: ReconciliationStatus.POSSIBLE_MATCH,
        ...(onlyCandidateId ? { transactionId: onlyCandidateId } : {}),
        ...(realCandidate
          ? { sourceRecordId: realCandidate.sourceRecordId }
          : manualCandidate?.sourceRecords[0]
            ? { sourceRecordId: manualCandidate.sourceRecords[0].id }
            : {}),
        candidateTransactionIds,
        reason:
          candidateTransactionIds.length > 1
            ? `金额和时间范围内存在 ${candidateTransactionIds.length} 个候选，不能自动选择`
            : manualCandidate
              ? '发现只有 MANUAL 来源的相似账单，需要用户确认'
              : `金额相同但时间差${Math.round((realCandidate?.difference || 0) / 1000)}秒，需要用户确认`,
      }
    }

    return this.createResult(ReconciliationStatus.NEW, '未找到可确认的历史来源或跨平台候选')
  }

  private readonly findExistingSource = async (
    userId: string,
    input: ReconciliationSourceInput,
  ) => {
    const identityConditions: Prisma.TransactionSourceRecordWhereInput[] = []

    if (input.sourceOrderId) {
      identityConditions.push({ sourceOrderId: input.sourceOrderId })
    }

    if (input.fingerprint) {
      identityConditions.push({ fingerprint: input.fingerprint })
    }

    if (input.sourceTransactionId) {
      identityConditions.push({ sourceTransactionId: input.sourceTransactionId })
    }

    if (!identityConditions.length) return null

    const candidates = await this.prismaService.transactionSourceRecord.findMany({
      where: {
        userId,
        source: input.source,
        OR: identityConditions,
      },
    })

    if (input.sourceOrderId) {
      const orderMatches = candidates.filter(
        (candidate) => candidate.sourceOrderId === input.sourceOrderId,
      )
      if (orderMatches.length === 1) return orderMatches[0]

      const preciseOrderMatches = orderMatches.filter(
        (candidate) =>
          candidate.sourceTransactionTime.getTime() === input.sourceTransactionTime.getTime() &&
          candidate.sourceAmount.equals(new Prisma.Decimal(input.sourceAmount)),
      )
      if (preciseOrderMatches.length === 1) return preciseOrderMatches[0]
    }

    if (input.fingerprint) {
      const fingerprintMatches = candidates.filter(
        (candidate) => candidate.fingerprint === input.fingerprint,
      )
      if (fingerprintMatches.length === 1) return fingerprintMatches[0]
    }

    if (input.sourceTransactionId) {
      const transactionIdMatches = candidates.filter(
        (candidate) => candidate.sourceTransactionId === input.sourceTransactionId,
      )
      const preciseTransactionMatches = transactionIdMatches.filter(
        (candidate) =>
          candidate.sourceTransactionTime.getTime() === input.sourceTransactionTime.getTime() &&
          candidate.sourceAmount.equals(new Prisma.Decimal(input.sourceAmount)),
      )
      if (preciseTransactionMatches.length === 1) return preciseTransactionMatches[0]
    }

    return null
  }

  private readonly getChangedFields = (
    existingSource: NonNullable<Awaited<ReturnType<typeof this.findExistingSource>>>,
    input: ReconciliationSourceInput,
    sourceAmount: Prisma.Decimal,
  ): string[] => {
    const changedFields: string[] = []
    if (existingSource.source !== input.source) changedFields.push('source')
    if (existingSource.sourceTransactionId !== input.sourceTransactionId) {
      changedFields.push('sourceTransactionId')
    }
    if (existingSource.sourceOrderId !== input.sourceOrderId) changedFields.push('sourceOrderId')
    if (existingSource.sourceTransactionTime.getTime() !== input.sourceTransactionTime.getTime()) {
      changedFields.push('sourceTransactionTime')
    }
    if (!existingSource.sourceAmount.equals(sourceAmount)) changedFields.push('sourceAmount')
    if (input.sourceStatus !== undefined && existingSource.sourceStatus !== input.sourceStatus) {
      changedFields.push('sourceStatus')
    }
    if (
      input.sourceCategory !== undefined &&
      existingSource.sourceCategory !== input.sourceCategory
    ) {
      changedFields.push('sourceCategory')
    }
    if (input.paymentMethod !== undefined && existingSource.paymentMethod !== input.paymentMethod) {
      changedFields.push('paymentMethod')
    }
    if (
      input.sourceRecordKind !== undefined &&
      input.sourceRecordKind !== null &&
      existingSource.sourceRecordKind !== input.sourceRecordKind
    ) {
      changedFields.push('sourceRecordKind')
    }
    if (existingSource.fingerprint !== input.fingerprint) changedFields.push('fingerprint')
    if (this.serializeJson(existingSource.rawData) !== this.serializeJson(input.rawData)) {
      changedFields.push('rawData')
    }

    return changedFields
  }

  private readonly isRealPlatformSource = (source: TransactionSource): boolean => {
    return REAL_PLATFORM_SOURCES.includes(source as (typeof REAL_PLATFORM_SOURCES)[number])
  }

  private readonly serializeJson = (value: unknown): string => {
    return JSON.stringify(this.sortJson(value))
  }

  private readonly sortJson = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map((item) => this.sortJson(item))

    if (value !== null && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((result, key) => {
          result[key] = this.sortJson((value as Record<string, unknown>)[key])
          return result
        }, {})
    }

    return value
  }

  private readonly createResult = (
    status: ReconciliationStatus,
    reason?: string,
  ): ReconciliationResult => ({
    status,
    candidateTransactionIds: [],
    ...(reason ? { reason } : {}),
  })
}
