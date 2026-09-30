import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { Prisma } from '../generated/prisma/client'
import {
  ImportRecordDecision,
  ImportRecordStatus,
  ImportReconcileStatus,
  ImportTaskStatus,
  SourceRecordKind,
  TransactionSource,
} from '../generated/prisma/enums'
import { PrismaService } from '../prisma/prisma.service'

const CONFIRM_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 60_000,
  timeout: 120_000,
} as const

interface ConfirmSummary {
  created: number
  linked: number
  updated: number
  unchanged: number
  ignored: number
}

@Injectable()
export class ImportConfirmService {
  constructor(private readonly prismaService: PrismaService) {}

  async confirm(userId: string, importTaskId: string) {
    return this.prismaService.$transaction(async (database) => {
      const task = await database.importTask.findFirst({ where: { id: importTaskId, userId } })
      if (!task) throw new NotFoundException('导入任务不存在')
      if (task.status === ImportTaskStatus.COMPLETED) {
        throw new ConflictException('该导入任务已经完成，不能重复确认')
      }
      if (task.status !== ImportTaskStatus.PREVIEW) {
        throw new ConflictException('只有预览中的导入任务可以确认')
      }

      const claimed = await database.importTask.updateMany({
        where: { id: importTaskId, userId, status: ImportTaskStatus.PREVIEW },
        data: { status: ImportTaskStatus.IMPORTING },
      })
      if (claimed.count !== 1) throw new ConflictException('导入任务正在处理，请勿重复确认')

      const records = await database.importRecord.findMany({
        where: { importTaskId, userId },
        orderBy: { createdAt: 'asc' },
      })
      const recordTags = await database.importRecordTag.findMany({
        where: { userId, importRecordId: { in: records.map((record) => record.id) } },
        select: { importRecordId: true, tagId: true },
      })
      const blockerCounts = this.getBlockerCounts(records)
      if (Object.values(blockerCounts).some((count) => count > 0)) {
        throw new BadRequestException({ message: '仍有未处理记录', ...blockerCounts })
      }

      const summary: ConfirmSummary = {
        created: 0,
        linked: 0,
        updated: 0,
        unchanged: 0,
        ignored: 0,
      }
      const importedIds: string[] = []

      for (const record of records) {
        if (record.status === ImportRecordStatus.IGNORED) {
          summary.ignored += 1
          continue
        }

        const decision = this.getEffectiveDecision(record.reconcileStatus, record.decision)
        const tagIds = recordTags
          .filter((recordTag) => recordTag.importRecordId === record.id)
          .map((recordTag) => recordTag.tagId)

        if (record.reconcileStatus === ImportReconcileStatus.UNCHANGED) {
          summary.unchanged += 1
          importedIds.push(record.id)
          continue
        }

        if (decision === ImportRecordDecision.CREATE_NEW) {
          await this.createNewTransaction(database, userId, record, tagIds)
          summary.created += 1
          importedIds.push(record.id)
          continue
        }

        if (decision === ImportRecordDecision.LINK_EXISTING) {
          await this.linkExistingTransaction(database, userId, record)
          summary.linked += 1
          importedIds.push(record.id)
          continue
        }

        if (decision === ImportRecordDecision.APPLY_CHANGE) {
          await this.applyChangedSource(database, userId, record)
          summary.updated += 1
          importedIds.push(record.id)
          continue
        }

        throw new BadRequestException('存在无法执行的导入决策')
      }

      if (importedIds.length) {
        await database.importRecord.updateMany({
          where: { userId, importTaskId, id: { in: importedIds } },
          data: { status: ImportRecordStatus.IMPORTED },
        })
      }

      await database.importTask.update({
        where: { id: importTaskId },
        data: {
          status: ImportTaskStatus.COMPLETED,
          totalCount: records.length,
          validCount: importedIds.length,
          duplicateCount: summary.unchanged,
          ignoredCount: summary.ignored,
          importedCount: importedIds.length,
          errorMessage: null,
        },
      })

      return { importTaskId, ...summary }
    }, CONFIRM_TRANSACTION_OPTIONS)
  }

  private readonly getBlockerCounts = (
    records: Array<{
      status: ImportRecordStatus
      reconcileStatus: ImportReconcileStatus | null
      decision: ImportRecordDecision
    }>,
  ) => {
    const activeRecords = records.filter((record) => record.status !== ImportRecordStatus.IGNORED)
    return {
      pendingPossibleMatches: activeRecords.filter(
        (record) =>
          record.reconcileStatus === ImportReconcileStatus.POSSIBLE_MATCH &&
          record.decision === ImportRecordDecision.PENDING,
      ).length,
      pendingChanges: activeRecords.filter(
        (record) =>
          record.reconcileStatus === ImportReconcileStatus.CHANGED &&
          record.decision === ImportRecordDecision.PENDING,
      ).length,
      unsupported: activeRecords.filter(
        (record) => record.reconcileStatus === ImportReconcileStatus.UNSUPPORTED,
      ).length,
      errors: activeRecords.filter((record) => record.status === ImportRecordStatus.ERROR).length,
      incomplete: activeRecords.filter(
        (record) =>
          record.status === ImportRecordStatus.PENDING ||
          record.status === ImportRecordStatus.DUPLICATE ||
          (!record.reconcileStatus && record.status !== ImportRecordStatus.ERROR),
      ).length,
    }
  }

  private readonly getEffectiveDecision = (
    reconcileStatus: ImportReconcileStatus | null,
    decision: ImportRecordDecision,
  ): ImportRecordDecision => {
    if (decision !== ImportRecordDecision.PENDING) return decision
    if (reconcileStatus === ImportReconcileStatus.NEW) return ImportRecordDecision.CREATE_NEW
    if (reconcileStatus === ImportReconcileStatus.AUTO_MATCH) {
      return ImportRecordDecision.LINK_EXISTING
    }
    return decision
  }

  private readonly createNewTransaction = async (
    database: Prisma.TransactionClient,
    userId: string,
    record: Prisma.ImportRecordGetPayload<Record<string, never>>,
    tagIds: string[],
  ): Promise<void> => {
    this.ensureCompleteRecord(record)
    if (!record.amount!.isPositive()) {
      throw new BadRequestException('作为新账单导入时金额必须大于 0')
    }
    await this.validateRelations(database, userId, record, tagIds)

    const transaction = await database.transaction.create({
      data: {
        userId,
        type: record.type!,
        amount: record.amount!,
        transactionTime: record.transactionTime!,
        merchant: record.merchant,
        description: record.description,
        remark: record.remark,
        categoryId: record.categoryId,
        ledgerId: record.ledgerId!,
        accountId: record.accountId,
      },
    })
    await this.createSourceRecord(database, transaction.userId, transaction.id, record)
    if (tagIds.length) {
      await database.transactionTag.createMany({
        data: tagIds.map((tagId) => ({ userId, transactionId: transaction.id, tagId })),
      })
    }
  }

  private readonly linkExistingTransaction = async (
    database: Prisma.TransactionClient,
    userId: string,
    record: Prisma.ImportRecordGetPayload<Record<string, never>>,
  ): Promise<void> => {
    this.ensureCompleteSource(record)
    if (!record.candidateTransactionId) {
      throw new BadRequestException('关联已有账单时缺少候选账单')
    }
    const transaction = await database.transaction.findFirst({
      where: { id: record.candidateTransactionId, userId },
      select: { id: true, userId: true },
    })
    if (!transaction) throw new BadRequestException('候选账单已不存在或不属于当前用户')

    await this.ensureSourceNotImported(database, userId, record)
    await this.createSourceRecord(database, transaction.userId, transaction.id, record)

    if (record.sourceRecordKind === SourceRecordKind.REFUND) {
      await this.recalculateRefundAmount(
        database,
        userId,
        transaction.id,
        record.candidateSourceRecordId,
      )
    }
  }

  private readonly applyChangedSource = async (
    database: Prisma.TransactionClient,
    userId: string,
    record: Prisma.ImportRecordGetPayload<Record<string, never>>,
  ): Promise<void> => {
    this.ensureCompleteSource(record)
    if (!record.candidateTransactionId || !record.candidateSourceRecordId) {
      throw new BadRequestException('应用变化时缺少确定的历史来源记录')
    }
    const existingSource = await database.transactionSourceRecord.findFirst({
      where: {
        id: record.candidateSourceRecordId,
        userId,
        transactionId: record.candidateTransactionId,
      },
    })
    if (!existingSource) throw new BadRequestException('历史来源记录已不存在或不属于当前用户')

    await database.transactionSourceRecord.update({
      where: { id: existingSource.id },
      data: {
        source: record.source,
        sourceTransactionId: record.sourceTransactionId,
        sourceOrderId: record.sourceOrderId,
        sourceTransactionTime: record.sourceTransactionTime!,
        sourceAmount: record.sourceAmount!,
        sourceStatus: record.sourceStatus,
        sourceCategory: record.sourceCategory,
        paymentMethod: record.paymentMethod,
        sourceRecordKind: record.sourceRecordKind!,
        fingerprint: record.fingerprint,
        rawData: record.rawData === null ? Prisma.JsonNull : record.rawData,
      },
    })

    if (
      record.sourceRecordKind === SourceRecordKind.REFUND ||
      existingSource.sourceRecordKind === SourceRecordKind.REFUND
    ) {
      await this.recalculateRefundAmount(database, userId, existingSource.transactionId, null)
      return
    }

    if (
      record.source === TransactionSource.JD &&
      record.amount &&
      record.sourceAmount &&
      record.amount.lessThan(record.sourceAmount)
    ) {
      await database.transaction.update({
        where: { id: existingSource.transactionId },
        data: { amount: record.amount },
      })
    }
  }

  private readonly recalculateRefundAmount = async (
    database: Prisma.TransactionClient,
    userId: string,
    transactionId: string,
    preferredNormalSourceId: string | null,
  ): Promise<void> => {
    const sources = await database.transactionSourceRecord.findMany({
      where: { userId, transactionId },
      select: { id: true, sourceAmount: true, sourceRecordKind: true },
    })
    const normalSources = sources.filter(
      (source) => source.sourceRecordKind === SourceRecordKind.NORMAL,
    )
    const preferredSource = preferredNormalSourceId
      ? normalSources.find((source) => source.id === preferredNormalSourceId)
      : null
    const normalAmounts = new Map(
      normalSources.map((source) => [source.sourceAmount.toFixed(), source.sourceAmount]),
    )
    const originalAmount =
      preferredSource?.sourceAmount ||
      (normalAmounts.size === 1 ? [...normalAmounts.values()][0] : null)

    if (!originalAmount) {
      throw new BadRequestException('无法确定退款对应的原始消费金额，请用户重新选择候选账单')
    }

    const refundTotal = sources
      .filter((source) => source.sourceRecordKind === SourceRecordKind.REFUND)
      .reduce((total, source) => total.plus(source.sourceAmount), new Prisma.Decimal(0))
    if (refundTotal.greaterThan(originalAmount)) {
      throw new BadRequestException(
        `退款合计 ${refundTotal.toFixed()} 超过原始消费金额 ${originalAmount.toFixed()}，请检查退款关联`,
      )
    }

    await database.transaction.update({
      where: { id: transactionId },
      data: { amount: originalAmount.minus(refundTotal) },
    })
  }

  private readonly createSourceRecord = async (
    database: Prisma.TransactionClient,
    userId: string,
    transactionId: string,
    record: Prisma.ImportRecordGetPayload<Record<string, never>>,
  ): Promise<void> => {
    await database.transactionSourceRecord.create({
      data: {
        userId,
        transactionId,
        source: record.source,
        sourceTransactionId: record.sourceTransactionId,
        sourceOrderId: record.sourceOrderId,
        sourceTransactionTime: record.sourceTransactionTime!,
        sourceAmount: record.sourceAmount!,
        sourceStatus: record.sourceStatus,
        sourceCategory: record.sourceCategory,
        paymentMethod: record.paymentMethod,
        sourceRecordKind: record.sourceRecordKind!,
        fingerprint: record.fingerprint,
        rawData: record.rawData === null ? Prisma.JsonNull : record.rawData,
      },
    })
  }

  private readonly ensureSourceNotImported = async (
    database: Prisma.TransactionClient,
    userId: string,
    record: Prisma.ImportRecordGetPayload<Record<string, never>>,
  ): Promise<void> => {
    const identityConditions: Prisma.TransactionSourceRecordWhereInput[] = []
    if (record.sourceOrderId) identityConditions.push({ sourceOrderId: record.sourceOrderId })
    if (record.sourceTransactionId) {
      identityConditions.push({ sourceTransactionId: record.sourceTransactionId })
    }
    if (
      !record.sourceOrderId &&
      !record.sourceTransactionId &&
      record.fingerprint &&
      record.sourceTransactionTime &&
      record.sourceAmount
    ) {
      identityConditions.push({
        fingerprint: record.fingerprint,
        sourceTransactionTime: record.sourceTransactionTime,
        sourceAmount: record.sourceAmount,
      })
    }
    if (!identityConditions.length) return

    const existing = await database.transactionSourceRecord.findFirst({
      where: { userId, source: record.source, OR: identityConditions },
      select: { id: true },
    })
    if (existing) throw new ConflictException('该平台来源已被其他导入任务处理，请重新上传账单')
  }

  private readonly validateRelations = async (
    database: Prisma.TransactionClient,
    userId: string,
    record: Prisma.ImportRecordGetPayload<Record<string, never>>,
    tagIds: string[],
  ): Promise<void> => {
    const ledger = await database.ledger.findFirst({
      where: { id: record.ledgerId!, userId },
      select: { id: true },
    })
    if (!ledger) throw new NotFoundException('账本不存在')

    if (record.categoryId) {
      const category = await database.category.findFirst({
        where: { id: record.categoryId, userId },
        select: { type: true, isActive: true },
      })
      if (!category) throw new NotFoundException('分类不存在')
      if (!category.isActive) throw new BadRequestException('停用分类不能用于新账单')
      if (category.type !== record.type) throw new BadRequestException('账单收支类型与分类不一致')
    }

    if (record.accountId) {
      const account = await database.account.findFirst({
        where: { id: record.accountId, userId },
        select: { isActive: true },
      })
      if (!account) throw new NotFoundException('账户不存在')
      if (!account.isActive) throw new BadRequestException('停用账户不能用于新账单')
    }

    if (tagIds.length) {
      const tagCount = await database.tag.count({ where: { userId, id: { in: tagIds } } })
      if (tagCount !== tagIds.length) throw new NotFoundException('部分标签不存在')
    }
  }

  private readonly ensureCompleteRecord = (
    record: Prisma.ImportRecordGetPayload<Record<string, never>>,
  ): void => {
    this.ensureCompleteSource(record)
    if (!record.transactionTime || !record.type || !record.amount || !record.ledgerId) {
      throw new BadRequestException('导入记录缺少创建账单所需的标准化字段')
    }
  }

  private readonly ensureCompleteSource = (
    record: Prisma.ImportRecordGetPayload<Record<string, never>>,
  ): void => {
    if (!record.sourceTransactionTime || !record.sourceAmount || !record.sourceRecordKind) {
      throw new BadRequestException('导入记录缺少平台来源事实，不能确认导入')
    }
  }
}
