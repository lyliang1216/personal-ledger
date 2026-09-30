import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { Prisma } from '../generated/prisma/client'
import {
  ImportRecordStatus,
  ImportReconcileStatus,
  ImportTaskStatus,
  TransactionSource,
} from '../generated/prisma/enums'
import { PrismaService } from '../prisma/prisma.service'
import type { QueryImportRecordDto, QueryImportTaskDto } from './dto/query-import.dto'
import type {
  ImportReconciliationOutcome,
  NormalizedImportRecord,
  UploadedBillFile,
} from './imports.types'
import { BillParserRegistry } from './parsers/bill-parser.registry'
import { cleanCell, ensureRecordLimit } from './parsers/parser.utils'
import { ImportReconciliationService } from './reconciliation/import-reconciliation.service'

const MAX_IMPORT_RECORDS = 10_000
const CREATE_BATCH_SIZE = 500
const RECONCILIATION_CONCURRENCY = 1
const SUPPORTED_EXTENSIONS = ['.csv', '.xlsx'] as const

const IMPORT_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 60_000,
  timeout: 120_000,
} as const

@Injectable()
export class ImportsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly parserRegistry: BillParserRegistry,
    private readonly importReconciliationService: ImportReconciliationService,
  ) {}

  async upload(userId: string, file?: UploadedBillFile) {
    const task = await this.prismaService.importTask.create({
      data: {
        userId,
        source: TransactionSource.OTHER,
        fileName: file?.originalname || '未获取文件名',
        status: ImportTaskStatus.PARSING,
      },
    })

    try {
      if (!file?.buffer.length) throw new BadRequestException('账单文件为空')
      if (!this.hasSupportedExtension(file.originalname)) {
        throw new BadRequestException('仅支持支付宝/京东 CSV 和微信支付 XLSX 文件')
      }

      const parsedBill = await this.parserRegistry.parse({
        fileName: file.originalname,
        mimeType: file.mimetype,
        buffer: file.buffer,
      })

      if (!parsedBill) {
        throw new BadRequestException(
          '无法识别账单文件格式，请检查账单是否来自支持的平台或平台格式是否已更新。',
        )
      }

      if (!parsedBill.records.length) throw new BadRequestException('账单文件中没有可读取的记录')
      ensureRecordLimit(parsedBill.records.length, MAX_IMPORT_RECORDS)

      const defaultLedgers = await this.prismaService.ledger.findMany({
        where: { userId, isDefault: true },
        select: { id: true },
        take: 2,
      })
      const accounts = await this.prismaService.account.findMany({
        where: { userId, isActive: true },
        select: { id: true, name: true },
      })

      if (defaultLedgers.length !== 1) {
        throw new ConflictException('当前用户默认账本状态异常，无法创建导入预览')
      }

      const accountMap = this.buildAccountMap(accounts)
      const recordData = await this.mapWithConcurrency(
        parsedBill.records,
        RECONCILIATION_CONCURRENCY,
        async (record) => {
          const validatedRecord = this.validateNormalizedRecord(record)
          const outcome = await this.importReconciliationService.reconcile(userId, validatedRecord)
          const accountId = validatedRecord.paymentMethod
            ? accountMap.get(this.normalizeAccountName(validatedRecord.paymentMethod)) || null
            : null

          return this.toCreateManyInput(
            task.id,
            userId,
            defaultLedgers[0]!.id,
            accountId,
            validatedRecord,
            outcome,
          )
        },
      )

      const readyCount = recordData.filter(
        (record) => record.status === ImportRecordStatus.READY,
      ).length
      const ignoredCount = recordData.filter(
        (record) => record.status === ImportRecordStatus.IGNORED,
      ).length

      await this.prismaService.$transaction(async (database) => {
        for (let index = 0; index < recordData.length; index += CREATE_BATCH_SIZE) {
          await database.importRecord.createMany({
            data: recordData.slice(index, index + CREATE_BATCH_SIZE),
          })
        }

        await database.importTask.update({
          where: { id: task.id },
          data: {
            source: parsedBill.source,
            status: ImportTaskStatus.PREVIEW,
            errorMessage: null,
            totalCount: recordData.length,
            validCount: readyCount,
            duplicateCount: 0,
            ignoredCount,
            importedCount: 0,
          },
        })
      }, IMPORT_TRANSACTION_OPTIONS)

      return this.findOne(userId, task.id)
    } catch (error) {
      return this.failTask(task.id, this.getErrorMessage(error))
    }
  }

  async createFailedTask(userId: string, fileName: string, errorMessage: string) {
    return this.prismaService.importTask.create({
      data: {
        userId,
        source: TransactionSource.OTHER,
        fileName,
        status: ImportTaskStatus.FAILED,
        errorMessage,
      },
    })
  }

  async findAll(userId: string, query: QueryImportTaskDto) {
    const where: Prisma.ImportTaskWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
    }
    const skip = (query.page - 1) * query.pageSize
    const items = await this.prismaService.importTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.pageSize,
    })
    const total = await this.prismaService.importTask.count({ where })

    return { items, total, page: query.page, pageSize: query.pageSize }
  }

  async findOne(userId: string, id: string) {
    const task = await this.getOwnedTask(userId, id)
    const statusGroups = await this.prismaService.importRecord.groupBy({
      by: ['status'],
      where: { userId, importTaskId: id },
      _count: { _all: true },
    })
    const reconcileGroups = await this.prismaService.importRecord.groupBy({
      by: ['reconcileStatus'],
      where: { userId, importTaskId: id },
      _count: { _all: true },
    })

    return {
      ...task,
      statusCounts: Object.fromEntries(
        statusGroups.map((group) => [group.status, group._count._all]),
      ),
      reconcileCounts: Object.fromEntries(
        reconcileGroups.map((group) => [group.reconcileStatus || 'UNSET', group._count._all]),
      ),
    }
  }

  async findRecords(userId: string, importTaskId: string, query: QueryImportRecordDto) {
    await this.getOwnedTask(userId, importTaskId)

    const keyword = query.keyword?.trim()
    const where: Prisma.ImportRecordWhereInput = {
      userId,
      importTaskId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.reconcileStatus ? { reconcileStatus: query.reconcileStatus } : {}),
      ...(keyword
        ? {
            OR: [
              { remark: { contains: keyword, mode: 'insensitive' } },
              { merchant: { contains: keyword, mode: 'insensitive' } },
              { description: { contains: keyword, mode: 'insensitive' } },
              { sourceTransactionId: { contains: keyword, mode: 'insensitive' } },
              { sourceOrderId: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    }
    const skip = (query.page - 1) * query.pageSize
    const items = await this.prismaService.importRecord.findMany({
      where,
      orderBy: [{ sourceTransactionTime: 'desc' }, { createdAt: 'asc' }],
      skip,
      take: query.pageSize,
    })
    const total = await this.prismaService.importRecord.count({ where })
    const recordIds = items.map((item) => item.id)
    const ledgerIds = this.uniqueIds(items.map((item) => item.ledgerId))
    const categoryIds = this.uniqueIds(items.map((item) => item.categoryId))
    const accountIds = this.uniqueIds(items.map((item) => item.accountId))
    const candidateTransactionIds = this.uniqueIds(items.map((item) => item.candidateTransactionId))
    const candidateSourceRecordIds = this.uniqueIds(
      items.map((item) => item.candidateSourceRecordId),
    )

    // Prisma 7 的 JS driver adapter 会把嵌套 relation include 拆成并行查询。
    // 这里保持串行批量读取，兼容 Supabase Transaction Pooler 的单连接语义。
    const ledgers = ledgerIds.length
      ? await this.prismaService.ledger.findMany({
          where: { userId, id: { in: ledgerIds } },
          select: { id: true, name: true },
        })
      : []
    const categories = categoryIds.length
      ? await this.prismaService.category.findMany({
          where: { userId, id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : []
    const accounts = accountIds.length
      ? await this.prismaService.account.findMany({
          where: { userId, id: { in: accountIds } },
          select: { id: true, name: true },
        })
      : []
    const recordTags = recordIds.length
      ? await this.prismaService.importRecordTag.findMany({
          where: { userId, importRecordId: { in: recordIds } },
          select: { importRecordId: true, tagId: true },
        })
      : []
    const tagIds = this.uniqueIds(recordTags.map((recordTag) => recordTag.tagId))
    const tags = tagIds.length
      ? await this.prismaService.tag.findMany({
          where: { userId, id: { in: tagIds } },
          select: { id: true, name: true },
        })
      : []
    const candidateTransactions = candidateTransactionIds.length
      ? await this.prismaService.transaction.findMany({
          where: { userId, id: { in: candidateTransactionIds } },
          select: { id: true, type: true, amount: true, transactionTime: true, merchant: true },
        })
      : []
    const candidateSourceRecords = candidateSourceRecordIds.length
      ? await this.prismaService.transactionSourceRecord.findMany({
          where: { userId, id: { in: candidateSourceRecordIds } },
          select: {
            id: true,
            source: true,
            sourceAmount: true,
            sourceTransactionTime: true,
          },
        })
      : []

    const ledgersById = new Map(ledgers.map((ledger) => [ledger.id, ledger]))
    const categoriesById = new Map(categories.map((category) => [category.id, category]))
    const accountsById = new Map(accounts.map((account) => [account.id, account]))
    const tagsById = new Map(tags.map((tag) => [tag.id, tag]))
    const tagIdsByRecordId = new Map<string, string[]>()
    recordTags.forEach((recordTag) => {
      const current = tagIdsByRecordId.get(recordTag.importRecordId) || []
      current.push(recordTag.tagId)
      tagIdsByRecordId.set(recordTag.importRecordId, current)
    })
    const candidateTransactionsById = new Map(
      candidateTransactions.map((transaction) => [transaction.id, transaction]),
    )
    const candidateSourceRecordsById = new Map(
      candidateSourceRecords.map((sourceRecord) => [sourceRecord.id, sourceRecord]),
    )

    return {
      items: items.map((item) => {
        const candidateTransaction = item.candidateTransactionId
          ? candidateTransactionsById.get(item.candidateTransactionId)
          : null
        const candidateSourceRecord = item.candidateSourceRecordId
          ? candidateSourceRecordsById.get(item.candidateSourceRecordId)
          : null
        return {
          ...item,
          sourceAmount: item.sourceAmount?.toString() || null,
          amount: item.amount?.toString() || null,
          ledger: item.ledgerId ? ledgersById.get(item.ledgerId) || null : null,
          category: item.categoryId ? categoriesById.get(item.categoryId) || null : null,
          account: item.accountId ? accountsById.get(item.accountId) || null : null,
          tags: (tagIdsByRecordId.get(item.id) || [])
            .map((tagId) => tagsById.get(tagId))
            .filter((tag): tag is { id: string; name: string } => Boolean(tag)),
          candidateTransaction: candidateTransaction
            ? { ...candidateTransaction, amount: candidateTransaction.amount.toString() }
            : null,
          candidateSourceRecord: candidateSourceRecord
            ? {
                ...candidateSourceRecord,
                sourceAmount: candidateSourceRecord.sourceAmount.toString(),
              }
            : null,
        }
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  private readonly uniqueIds = (ids: Array<string | null>): string[] => [
    ...new Set(ids.filter((id): id is string => Boolean(id))),
  ]

  private readonly validateNormalizedRecord = (
    record: NormalizedImportRecord,
  ): NormalizedImportRecord => {
    if (
      record.status !== ImportRecordStatus.ERROR &&
      record.reconcileStatus !== ImportReconcileStatus.UNSUPPORTED &&
      record.status !== ImportRecordStatus.IGNORED &&
      (!record.transactionTime ||
        !record.type ||
        !record.amount ||
        !record.sourceTransactionTime ||
        !record.sourceAmount ||
        !record.sourceRecordKind)
    ) {
      return {
        ...record,
        status: ImportRecordStatus.ERROR,
        reconcileStatus: null,
        parserWarnings: [...record.parserWarnings, '标准化记录缺少 READY 状态所需字段'],
      }
    }

    return record
  }

  private readonly toCreateManyInput = (
    importTaskId: string,
    userId: string,
    ledgerId: string,
    accountId: string | null,
    record: NormalizedImportRecord,
    outcome: ImportReconciliationOutcome | null,
  ): Prisma.ImportRecordCreateManyInput => ({
    importTaskId,
    userId,
    source: record.source,
    sourceTransactionId: record.sourceTransactionId,
    sourceOrderId: record.sourceOrderId,
    sourceTransactionTime: record.sourceTransactionTime,
    sourceAmount: record.sourceAmount ? new Prisma.Decimal(record.sourceAmount) : null,
    sourceStatus: record.sourceStatus,
    sourceCategory: record.sourceCategory,
    paymentMethod: record.paymentMethod,
    sourceRecordKind: record.sourceRecordKind,
    transactionTime: record.transactionTime,
    amount: record.amount ? new Prisma.Decimal(record.amount) : null,
    type: record.type,
    merchant: record.merchant,
    description: record.description,
    remark: record.remark,
    categoryId: null,
    ledgerId,
    accountId,
    fingerprint: record.fingerprint,
    rawData: record.rawData,
    status: record.status,
    reconcileStatus: outcome?.reconcileStatus || record.reconcileStatus,
    candidateTransactionId: outcome?.candidateTransactionId || null,
    candidateSourceRecordId: outcome?.candidateSourceRecordId || null,
    reconcileReason: outcome?.reconcileReason || record.normalizationReason,
    changeReason: outcome?.changeReason || null,
    parserWarnings: record.parserWarnings,
  })

  private readonly getOwnedTask = async (userId: string, id: string) => {
    const task = await this.prismaService.importTask.findFirst({ where: { id, userId } })
    if (!task) throw new NotFoundException('导入任务不存在')
    return task
  }

  private readonly failTask = (id: string, errorMessage: string) => {
    return this.prismaService.importTask.update({
      where: { id },
      data: { status: ImportTaskStatus.FAILED, errorMessage },
    })
  }

  private readonly getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && cleanCell(error.message)) return cleanCell(error.message)
    return '账单文件解析失败，请检查文件格式是否已更新。'
  }

  private readonly hasSupportedExtension = (fileName: string): boolean => {
    const normalized = fileName.toLowerCase()
    return SUPPORTED_EXTENSIONS.some((extension) => normalized.endsWith(extension))
  }

  private readonly normalizeAccountName = (name: string): string => {
    return cleanCell(name).replace(/\s+/g, '').toLowerCase()
  }

  private readonly buildAccountMap = (
    accounts: Array<{ id: string; name: string }>,
  ): Map<string, string | null> => {
    const result = new Map<string, string | null>()
    accounts.forEach((account) => {
      const key = this.normalizeAccountName(account.name)
      result.set(key, result.has(key) ? null : account.id)
    })
    return result
  }

  private readonly mapWithConcurrency = async <Input, Output>(
    items: Input[],
    concurrency: number,
    mapper: (item: Input) => Promise<Output>,
  ): Promise<Output[]> => {
    const results = new Array<Output>(items.length)
    let nextIndex = 0

    const worker = async (): Promise<void> => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        results[currentIndex] = await mapper(items[currentIndex]!)
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, async () => worker()),
    )
    return results
  }
}
