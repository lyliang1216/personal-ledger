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
  TransactionType,
} from '../generated/prisma/enums'
import { PrismaService } from '../prisma/prisma.service'
import type {
  BatchImportAccountDto,
  BatchImportCategoryDto,
  BatchImportLedgerDto,
  BatchImportTagsDto,
  ImportRecordIdsDto,
  UpdateImportDecisionDto,
  UpdateImportRecordDto,
} from './dto/import-record.dto'
import { ImportTagBatchMode } from './dto/import-record.dto'

const REAL_PLATFORM_SOURCES = [
  TransactionSource.ALIPAY,
  TransactionSource.WECHAT,
  TransactionSource.JD,
  TransactionSource.TAOBAO,
] as const

const CANDIDATE_WINDOW_MS = 10 * 60_000
const WRITE_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 60_000,
  timeout: 120_000,
} as const

@Injectable()
export class ImportRecordsService {
  constructor(private readonly prismaService: PrismaService) {}

  async findOne(userId: string, id: string) {
    const record = await this.getOwnedRecord(this.prismaService, userId, id)
    const tags = await this.getRecordTags(this.prismaService, userId, id)
    const candidateTransaction = record.candidateTransactionId
      ? await this.getCandidateTransaction(
          this.prismaService,
          userId,
          record.candidateTransactionId,
        )
      : null
    const candidateSourceRecord = record.candidateSourceRecordId
      ? await this.prismaService.transactionSourceRecord.findFirst({
          where: { id: record.candidateSourceRecordId, userId },
        })
      : null

    return this.serializeRecord(record, tags, candidateTransaction, candidateSourceRecord)
  }

  async update(userId: string, id: string, dto: UpdateImportRecordDto) {
    if (!Object.keys(dto).length) throw new BadRequestException('至少提供一个可修改字段')

    await this.prismaService.$transaction(async (database) => {
      const record = await this.getOwnedRecord(database, userId, id)
      await this.ensureTaskMutable(database, userId, record.importTaskId)
      this.ensureRecordMutable(record.status)

      const targetType = dto.type ?? record.type
      const targetCategoryId = dto.categoryId === undefined ? record.categoryId : dto.categoryId

      if (dto.ledgerId !== undefined) {
        if (!dto.ledgerId) throw new BadRequestException('导入记录必须选择账本')
        await this.validateLedger(database, userId, dto.ledgerId)
      }
      if (targetCategoryId) {
        if (!targetType) throw new BadRequestException('设置分类前必须先选择收支类型')
        await this.validateCategory(database, userId, targetCategoryId, targetType)
      }
      if (dto.accountId) await this.validateAccount(database, userId, dto.accountId)
      if (dto.tagIds !== undefined) await this.validateTags(database, userId, dto.tagIds)

      await database.importRecord.update({
        where: { id },
        data: {
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.amount !== undefined ? { amount: new Prisma.Decimal(dto.amount) } : {}),
          ...(dto.transactionTime !== undefined
            ? { transactionTime: new Date(dto.transactionTime) }
            : {}),
          ...(dto.merchant !== undefined ? { merchant: dto.merchant || null } : {}),
          ...(dto.description !== undefined ? { description: dto.description || null } : {}),
          ...(dto.remark !== undefined ? { remark: dto.remark || null } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.ledgerId !== undefined ? { ledgerId: dto.ledgerId } : {}),
          ...(dto.accountId !== undefined ? { accountId: dto.accountId } : {}),
        },
      })

      if (dto.tagIds !== undefined) {
        await database.importRecordTag.deleteMany({ where: { userId, importRecordId: id } })
        if (dto.tagIds.length) {
          await database.importRecordTag.createMany({
            data: dto.tagIds.map((tagId) => ({ userId, importRecordId: id, tagId })),
          })
        }
      }
    }, WRITE_TRANSACTION_OPTIONS)

    return this.findOne(userId, id)
  }

  async updateDecision(userId: string, id: string, dto: UpdateImportDecisionDto) {
    await this.prismaService.$transaction(async (database) => {
      const record = await this.getOwnedRecord(database, userId, id)
      await this.ensureTaskMutable(database, userId, record.importTaskId)
      this.ensureRecordMutable(record.status)

      if (dto.decision === ImportRecordDecision.LINK_EXISTING) {
        if (
          record.reconcileStatus !== ImportReconcileStatus.POSSIBLE_MATCH &&
          record.reconcileStatus !== ImportReconcileStatus.AUTO_MATCH
        ) {
          throw new BadRequestException('当前对账状态不能关联已有账单')
        }
        if (!dto.candidateTransactionId) {
          throw new BadRequestException('关联已有账单时必须选择候选账单')
        }

        const candidateIds = await this.findCandidateTransactionIds(database, userId, record)
        if (!candidateIds.includes(dto.candidateTransactionId)) {
          throw new BadRequestException('所选账单已不在当前记录的候选范围内')
        }

        const sourceRecordId = await this.resolveCandidateSourceRecordId(
          database,
          userId,
          dto.candidateTransactionId,
          dto.candidateSourceRecordId,
          record.candidateSourceRecordId,
        )
        await database.importRecord.update({
          where: { id },
          data: {
            decision: dto.decision,
            candidateTransactionId: dto.candidateTransactionId,
            candidateSourceRecordId: sourceRecordId,
          },
        })
        return
      }

      if (dto.decision === ImportRecordDecision.CREATE_NEW) {
        if (
          record.reconcileStatus !== ImportReconcileStatus.NEW &&
          record.reconcileStatus !== ImportReconcileStatus.POSSIBLE_MATCH &&
          record.reconcileStatus !== ImportReconcileStatus.AUTO_MATCH
        ) {
          throw new BadRequestException('当前对账状态不能作为新账单导入')
        }
        await database.importRecord.update({
          where: { id },
          data: {
            decision: dto.decision,
            candidateTransactionId: null,
            candidateSourceRecordId: null,
          },
        })
        return
      }

      if (dto.decision === ImportRecordDecision.APPLY_CHANGE) {
        if (record.reconcileStatus !== ImportReconcileStatus.CHANGED) {
          throw new BadRequestException('只有历史变化记录可以应用变化')
        }
        if (!record.candidateTransactionId || !record.candidateSourceRecordId) {
          throw new BadRequestException('历史变化记录缺少确定的历史来源')
        }
        await this.validateChangedCandidate(database, userId, record)
        await database.importRecord.update({
          where: { id },
          data: { decision: dto.decision },
        })
        return
      }

      throw new BadRequestException('不能将记录决策重置为 PENDING')
    }, WRITE_TRANSACTION_OPTIONS)

    return this.findOne(userId, id)
  }

  async findCandidates(userId: string, id: string) {
    const record = await this.getOwnedRecord(this.prismaService, userId, id)
    if (
      record.reconcileStatus !== ImportReconcileStatus.POSSIBLE_MATCH &&
      record.reconcileStatus !== ImportReconcileStatus.AUTO_MATCH
    ) {
      throw new BadRequestException('当前记录不需要选择候选账单')
    }

    const candidateIds = await this.findCandidateTransactionIds(this.prismaService, userId, record)
    if (!candidateIds.length) return []

    const transactions = await this.prismaService.transaction.findMany({
      where: { userId, id: { in: candidateIds } },
      select: {
        id: true,
        transactionTime: true,
        amount: true,
        merchant: true,
        description: true,
        remark: true,
      },
      orderBy: { transactionTime: 'desc' },
    })
    const sources = await this.prismaService.transactionSourceRecord.findMany({
      where: { userId, transactionId: { in: candidateIds } },
      select: { id: true, transactionId: true, source: true, sourceRecordKind: true },
      orderBy: { createdAt: 'asc' },
    })

    return transactions.map((transaction) => ({
      ...transaction,
      amount: transaction.amount.toString(),
      sources: sources.filter((source) => source.transactionId === transaction.id),
    }))
  }

  async ignore(userId: string, id: string) {
    const result = await this.updateStatus(userId, [id], ImportRecordStatus.IGNORED)
    return { ...result, record: await this.findOne(userId, id) }
  }

  async restore(userId: string, id: string) {
    const result = await this.restoreRecords(userId, [id])
    return { ...result, record: await this.findOne(userId, id) }
  }

  async batchIgnore(userId: string, dto: ImportRecordIdsDto) {
    return this.updateStatus(userId, dto.ids, ImportRecordStatus.IGNORED)
  }

  async batchRestore(userId: string, dto: ImportRecordIdsDto) {
    return this.restoreRecords(userId, dto.ids)
  }

  async batchCategory(userId: string, dto: BatchImportCategoryDto) {
    return this.prismaService.$transaction(async (database) => {
      const records = await this.getMutableRecords(database, userId, dto.ids)
      const category = await database.category.findFirst({
        where: { id: dto.categoryId, userId },
        select: { type: true, isActive: true },
      })
      if (!category) throw new NotFoundException('分类不存在')
      if (!category.isActive) throw new BadRequestException('停用分类不能用于导入记录')
      if (records.some((record) => record.type !== category.type)) {
        throw new BadRequestException('所选记录的收支类型与分类不一致')
      }

      await database.importRecord.updateMany({
        where: { userId, id: { in: dto.ids } },
        data: { categoryId: dto.categoryId },
      })
      return { count: records.length }
    }, WRITE_TRANSACTION_OPTIONS)
  }

  async batchTags(userId: string, dto: BatchImportTagsDto) {
    return this.prismaService.$transaction(async (database) => {
      const records = await this.getMutableRecords(database, userId, dto.ids)
      await this.validateTags(database, userId, dto.tagIds)

      if (dto.mode === ImportTagBatchMode.ADD) {
        await database.importRecordTag.createMany({
          data: dto.ids.flatMap((importRecordId) =>
            dto.tagIds.map((tagId) => ({ userId, importRecordId, tagId })),
          ),
          skipDuplicates: true,
        })
      } else {
        await database.importRecordTag.deleteMany({
          where: {
            userId,
            importRecordId: { in: dto.ids },
            tagId: { in: dto.tagIds },
          },
        })
      }
      return { count: records.length }
    }, WRITE_TRANSACTION_OPTIONS)
  }

  async batchLedger(userId: string, dto: BatchImportLedgerDto) {
    return this.prismaService.$transaction(async (database) => {
      const records = await this.getMutableRecords(database, userId, dto.ids)
      await this.validateLedger(database, userId, dto.ledgerId)
      await database.importRecord.updateMany({
        where: { userId, id: { in: dto.ids } },
        data: { ledgerId: dto.ledgerId },
      })
      return { count: records.length }
    }, WRITE_TRANSACTION_OPTIONS)
  }

  async batchAccount(userId: string, dto: BatchImportAccountDto) {
    return this.prismaService.$transaction(async (database) => {
      const records = await this.getMutableRecords(database, userId, dto.ids)
      await this.validateAccount(database, userId, dto.accountId)
      await database.importRecord.updateMany({
        where: { userId, id: { in: dto.ids } },
        data: { accountId: dto.accountId },
      })
      return { count: records.length }
    }, WRITE_TRANSACTION_OPTIONS)
  }

  private readonly updateStatus = async (
    userId: string,
    ids: string[],
    status: ImportRecordStatus,
  ) => {
    return this.prismaService.$transaction(async (database) => {
      const records = await this.getMutableRecords(database, userId, ids)
      await database.importRecord.updateMany({
        where: { userId, id: { in: ids } },
        data: { status },
      })
      return { count: records.length }
    }, WRITE_TRANSACTION_OPTIONS)
  }

  private readonly restoreRecords = async (userId: string, ids: string[]) => {
    return this.prismaService.$transaction(async (database) => {
      const records = await this.getMutableRecords(database, userId, ids, true)
      await database.importRecord.updateMany({
        where: { userId, id: { in: ids } },
        data: { status: ImportRecordStatus.READY },
      })
      return { count: records.length, restored: records.length, errors: 0 }
    }, WRITE_TRANSACTION_OPTIONS)
  }

  private readonly getMutableRecords = async (
    database: Prisma.TransactionClient,
    userId: string,
    ids: string[],
    requireIgnored = false,
  ) => {
    const records = await database.importRecord.findMany({
      where: { userId, id: { in: ids } },
    })
    if (records.length !== ids.length) throw new NotFoundException('部分导入记录不存在')
    if (new Set(records.map((record) => record.importTaskId)).size !== 1) {
      throw new BadRequestException('批量操作的记录必须属于同一个导入任务')
    }
    await this.ensureTaskMutable(database, userId, records[0]!.importTaskId)
    if (requireIgnored && records.some((record) => record.status !== ImportRecordStatus.IGNORED)) {
      throw new BadRequestException('只有已忽略记录可以恢复')
    }
    if (!requireIgnored) records.forEach((record) => this.ensureRecordMutable(record.status))
    return records
  }

  private readonly getOwnedRecord = async (
    database: Prisma.TransactionClient | PrismaService,
    userId: string,
    id: string,
  ) => {
    const record = await database.importRecord.findFirst({ where: { id, userId } })
    if (!record) throw new NotFoundException('导入记录不存在')
    return record
  }

  private readonly ensureTaskMutable = async (
    database: Prisma.TransactionClient,
    userId: string,
    taskId: string,
  ): Promise<void> => {
    const task = await database.importTask.findFirst({
      where: { id: taskId, userId },
      select: { status: true },
    })
    if (!task) throw new NotFoundException('导入任务不存在')
    if (task.status !== ImportTaskStatus.PREVIEW) {
      throw new ConflictException('只有预览中的导入任务可以修改')
    }
  }

  private readonly ensureRecordMutable = (status: ImportRecordStatus): void => {
    if (status === ImportRecordStatus.IMPORTED) {
      throw new ConflictException('已导入记录不能修改')
    }
  }

  private readonly validateLedger = async (
    database: Prisma.TransactionClient,
    userId: string,
    ledgerId: string,
  ): Promise<void> => {
    const ledger = await database.ledger.findFirst({ where: { id: ledgerId, userId } })
    if (!ledger) throw new NotFoundException('账本不存在')
  }

  private readonly validateCategory = async (
    database: Prisma.TransactionClient,
    userId: string,
    categoryId: string,
    type: TransactionType,
  ): Promise<void> => {
    const category = await database.category.findFirst({
      where: { id: categoryId, userId },
      select: { type: true, isActive: true },
    })
    if (!category) throw new NotFoundException('分类不存在')
    if (!category.isActive) throw new BadRequestException('停用分类不能用于导入记录')
    if (category.type !== type) throw new BadRequestException('导入记录收支类型与分类不一致')
  }

  private readonly validateAccount = async (
    database: Prisma.TransactionClient,
    userId: string,
    accountId: string,
  ): Promise<void> => {
    const account = await database.account.findFirst({
      where: { id: accountId, userId },
      select: { isActive: true },
    })
    if (!account) throw new NotFoundException('账户不存在')
    if (!account.isActive) throw new BadRequestException('停用账户不能用于导入记录')
  }

  private readonly validateTags = async (
    database: Prisma.TransactionClient,
    userId: string,
    tagIds: string[],
  ): Promise<void> => {
    if (!tagIds.length) return
    const count = await database.tag.count({ where: { userId, id: { in: tagIds } } })
    if (count !== tagIds.length) throw new NotFoundException('部分标签不存在')
  }

  private readonly validateChangedCandidate = async (
    database: Prisma.TransactionClient,
    userId: string,
    record: { candidateTransactionId: string | null; candidateSourceRecordId: string | null },
  ): Promise<void> => {
    const sourceRecord = await database.transactionSourceRecord.findFirst({
      where: {
        id: record.candidateSourceRecordId!,
        userId,
        transactionId: record.candidateTransactionId!,
      },
    })
    if (!sourceRecord) throw new BadRequestException('历史来源记录已不存在或不属于当前用户')
  }

  private readonly resolveCandidateSourceRecordId = async (
    database: Prisma.TransactionClient,
    userId: string,
    transactionId: string,
    requestedSourceRecordId?: string,
    suggestedSourceRecordId?: string | null,
  ): Promise<string | null> => {
    const sourceRecordId = requestedSourceRecordId || suggestedSourceRecordId
    if (!sourceRecordId) return null
    const sourceRecord = await database.transactionSourceRecord.findFirst({
      where: { id: sourceRecordId, userId, transactionId },
      select: { id: true },
    })
    return sourceRecord?.id || null
  }

  private readonly findCandidateTransactionIds = async (
    database: Prisma.TransactionClient | PrismaService,
    userId: string,
    record: {
      candidateTransactionId: string | null
      source: TransactionSource
      sourceTransactionId: string | null
      sourceOrderId: string | null
      sourceTransactionTime: Date | null
      sourceAmount: Prisma.Decimal | null
      sourceRecordKind: SourceRecordKind | null
      type: TransactionType | null
    },
  ): Promise<string[]> => {
    const candidateIds = new Set<string>()
    if (record.candidateTransactionId) candidateIds.add(record.candidateTransactionId)
    if (!record.sourceTransactionTime || !record.sourceAmount || !record.type) {
      return [...candidateIds]
    }

    const rangeStart = new Date(record.sourceTransactionTime.getTime() - CANDIDATE_WINDOW_MS)
    const rangeEnd = new Date(record.sourceTransactionTime.getTime() + CANDIDATE_WINDOW_MS)

    if (record.sourceRecordKind === SourceRecordKind.REFUND) {
      const directConditions: Prisma.TransactionSourceRecordWhereInput[] = []
      if (record.sourceOrderId) directConditions.push({ sourceOrderId: record.sourceOrderId })
      if (record.sourceTransactionId) {
        directConditions.push({ sourceTransactionId: record.sourceTransactionId })
      }
      const refundSources = await database.transactionSourceRecord.findMany({
        where: {
          userId,
          sourceRecordKind: SourceRecordKind.NORMAL,
          sourceTransactionTime: { lt: record.sourceTransactionTime },
          transaction: { type: TransactionType.EXPENSE },
          OR: [
            ...(directConditions.length ? directConditions : []),
            { sourceAmount: record.sourceAmount },
          ],
        },
        select: { transactionId: true },
        orderBy: { sourceTransactionTime: 'desc' },
        take: 50,
      })
      refundSources.forEach((source) => candidateIds.add(source.transactionId))
      return [...candidateIds]
    }

    if ((REAL_PLATFORM_SOURCES as readonly TransactionSource[]).includes(record.source)) {
      const differentSources = REAL_PLATFORM_SOURCES.filter((source) => source !== record.source)
      const sourceCandidates = await database.transactionSourceRecord.findMany({
        where: {
          userId,
          source: { in: differentSources },
          sourceAmount: record.sourceAmount,
          sourceTransactionTime: { gte: rangeStart, lte: rangeEnd },
          transaction: { type: record.type },
        },
        select: { transactionId: true },
        take: 50,
      })
      sourceCandidates.forEach((source) => candidateIds.add(source.transactionId))

      const manualCandidates = await database.transaction.findMany({
        where: {
          userId,
          type: record.type,
          amount: record.sourceAmount,
          transactionTime: { gte: rangeStart, lte: rangeEnd },
          sourceRecords: {
            some: { source: TransactionSource.MANUAL },
            every: { source: TransactionSource.MANUAL },
          },
        },
        select: { id: true },
        take: 50,
      })
      manualCandidates.forEach((transaction) => candidateIds.add(transaction.id))
    }

    return [...candidateIds]
  }

  private readonly getRecordTags = async (
    database: Prisma.TransactionClient | PrismaService,
    userId: string,
    importRecordId: string,
  ) => {
    const recordTags = await database.importRecordTag.findMany({
      where: { userId, importRecordId },
      select: { tagId: true },
    })
    if (!recordTags.length) return []
    return database.tag.findMany({
      where: { userId, id: { in: recordTags.map((item) => item.tagId) } },
      select: { id: true, name: true },
    })
  }

  private readonly getCandidateTransaction = async (
    database: Prisma.TransactionClient | PrismaService,
    userId: string,
    id: string,
  ) => {
    const transaction = await database.transaction.findFirst({
      where: { id, userId },
      select: {
        id: true,
        type: true,
        amount: true,
        transactionTime: true,
        merchant: true,
        description: true,
        remark: true,
      },
    })
    if (!transaction) return null
    const sources = await database.transactionSourceRecord.findMany({
      where: { userId, transactionId: id },
      select: { id: true, source: true, sourceRecordKind: true },
    })
    return { ...transaction, sources }
  }

  private readonly serializeRecord = (
    record: Awaited<ReturnType<ImportRecordsService['getOwnedRecord']>>,
    tags: Array<{ id: string; name: string }>,
    candidateTransaction: Awaited<ReturnType<ImportRecordsService['getCandidateTransaction']>>,
    candidateSourceRecord: Awaited<
      ReturnType<PrismaService['transactionSourceRecord']['findFirst']>
    >,
  ) => ({
    ...record,
    sourceAmount: record.sourceAmount?.toString() || null,
    amount: record.amount?.toString() || null,
    tags,
    candidateTransaction: candidateTransaction
      ? { ...candidateTransaction, amount: candidateTransaction.amount.toString() }
      : null,
    candidateSourceRecord: candidateSourceRecord
      ? {
          ...candidateSourceRecord,
          sourceAmount: candidateSourceRecord.sourceAmount.toString(),
        }
      : null,
  })
}
