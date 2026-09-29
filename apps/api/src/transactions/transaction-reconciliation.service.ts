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
      return this.createResult(ReconciliationStatus.UNSUPPORTED)
    }

    const sourceTime = input.sourceTransactionTime
    if (Number.isNaN(sourceTime.getTime())) {
      return this.createResult(ReconciliationStatus.UNSUPPORTED)
    }

    let sourceAmount: Prisma.Decimal
    try {
      sourceAmount = new Prisma.Decimal(input.sourceAmount)
    } catch (_error) {
      return this.createResult(ReconciliationStatus.UNSUPPORTED)
    }

    const existingSource = await this.findExistingSource(userId, input)
    if (existingSource) {
      const unchanged = this.isSourceUnchanged(existingSource, input, sourceAmount)

      return {
        status: unchanged ? ReconciliationStatus.UNCHANGED : ReconciliationStatus.CHANGED,
        transactionId: existingSource.transactionId,
        sourceRecordId: existingSource.id,
        candidateTransactionIds: [existingSource.transactionId],
      }
    }

    if (!this.isRealPlatformSource(input.source)) {
      return this.createResult(ReconciliationStatus.NEW)
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
        transactionId: true,
        sourceTransactionTime: true,
      },
    })

    const sourceCandidateDifferences = new Map<string, number>()
    sourceCandidates.forEach((candidate) => {
      const difference = Math.abs(candidate.sourceTransactionTime.getTime() - sourceTime.getTime())
      const currentDifference = sourceCandidateDifferences.get(candidate.transactionId)

      if (currentDifference === undefined || difference < currentDifference) {
        sourceCandidateDifferences.set(candidate.transactionId, difference)
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
      select: { id: true },
    })

    const realCandidateIds = [...sourceCandidateDifferences.keys()]
    const manualCandidateIds = manualCandidates.map((candidate) => candidate.id)
    const candidateTransactionIds = [...new Set([...realCandidateIds, ...manualCandidateIds])]

    if (
      realCandidateIds.length === 1 &&
      manualCandidateIds.length === 0 &&
      sourceCandidateDifferences.get(realCandidateIds[0]!)! <= AUTO_MATCH_WINDOW_MS
    ) {
      return {
        status: ReconciliationStatus.AUTO_MATCH,
        transactionId: realCandidateIds[0],
        candidateTransactionIds,
      }
    }

    if (candidateTransactionIds.length > 0) {
      return {
        status: ReconciliationStatus.POSSIBLE_MATCH,
        candidateTransactionIds,
      }
    }

    return this.createResult(ReconciliationStatus.NEW)
  }

  private readonly findExistingSource = async (
    userId: string,
    input: ReconciliationSourceInput,
  ) => {
    const identityConditions: Prisma.TransactionSourceRecordWhereInput[] = []

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
      if (transactionIdMatches.length === 1) return transactionIdMatches[0]
    }

    return null
  }

  private readonly isSourceUnchanged = (
    existingSource: NonNullable<Awaited<ReturnType<typeof this.findExistingSource>>>,
    input: ReconciliationSourceInput,
    sourceAmount: Prisma.Decimal,
  ): boolean => {
    return (
      existingSource.source === input.source &&
      existingSource.sourceTransactionId === input.sourceTransactionId &&
      existingSource.sourceOrderId === input.sourceOrderId &&
      existingSource.sourceTransactionTime.getTime() === input.sourceTransactionTime.getTime() &&
      existingSource.sourceAmount.equals(sourceAmount) &&
      (input.sourceStatus === undefined || existingSource.sourceStatus === input.sourceStatus) &&
      (input.sourceCategory === undefined ||
        existingSource.sourceCategory === input.sourceCategory) &&
      (input.paymentMethod === undefined || existingSource.paymentMethod === input.paymentMethod) &&
      existingSource.fingerprint === input.fingerprint &&
      this.serializeJson(existingSource.rawData) === this.serializeJson(input.rawData)
    )
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

  private readonly createResult = (status: ReconciliationStatus): ReconciliationResult => ({
    status,
    candidateTransactionIds: [],
  })
}
