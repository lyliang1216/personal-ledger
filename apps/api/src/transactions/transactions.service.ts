import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { Prisma } from '../generated/prisma/client'
import { TransactionSource, TransactionType } from '../generated/prisma/enums'
import { PrismaService } from '../prisma/prisma.service'
import type {
  BatchCategoryTransactionDto,
  BatchDeleteTransactionDto,
  BatchLedgerTransactionDto,
  BatchTagTransactionDto,
} from './dto/batch-transaction.dto'
import type { CreateTransactionDto } from './dto/create-transaction.dto'
import type { QueryTransactionDto } from './dto/query-transaction.dto'
import type { UpdateTransactionDto } from './dto/update-transaction.dto'

const TRANSACTION_LIST_INCLUDE = {
  ledger: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  account: { select: { id: true, name: true } },
  transactionTags: {
    orderBy: { createdAt: 'asc' },
    select: { tag: { select: { id: true, name: true } } },
  },
  sourceRecords: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      source: true,
      sourceTransactionId: true,
      sourceOrderId: true,
    },
  },
} satisfies Prisma.TransactionInclude

const TRANSACTION_DETAIL_INCLUDE = {
  ledger: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  account: { select: { id: true, name: true } },
  transactionTags: {
    orderBy: { createdAt: 'asc' },
    select: { tag: { select: { id: true, name: true } } },
  },
  sourceRecords: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TransactionInclude

const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 60_000,
  timeout: 60_000,
} as const

type TransactionListItem = Prisma.TransactionGetPayload<{
  include: typeof TRANSACTION_LIST_INCLUDE
}>

type TransactionDetail = Prisma.TransactionGetPayload<{
  include: typeof TRANSACTION_DETAIL_INCLUDE
}>

@Injectable()
export class TransactionsService {
  constructor(private readonly prismaService: PrismaService) {}

  async findAll(userId: string, query: QueryTransactionDto) {
    const where = await this.buildListWhere(userId, query)
    const skip = (query.page - 1) * query.pageSize
    const [items, total] = await this.prismaService.$transaction(async (database) => {
      const transactionItems = await database.transaction.findMany({
        where,
        include: TRANSACTION_LIST_INCLUDE,
        orderBy: [{ transactionTime: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.pageSize,
      })
      const transactionTotal = await database.transaction.count({ where })

      return [transactionItems, transactionTotal] as const
    }, TRANSACTION_OPTIONS)

    return {
      items: items.map((item) => this.serializeListItem(item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  async findOne(userId: string, id: string) {
    const transaction = await this.prismaService.transaction.findFirst({
      where: { id, userId },
      include: TRANSACTION_DETAIL_INCLUDE,
    })

    if (!transaction) {
      throw new NotFoundException('账单不存在')
    }

    return this.serializeDetail(transaction)
  }

  async create(userId: string, dto: CreateTransactionDto) {
    return this.prismaService.$transaction(async (database) => {
      const amount = this.parseAmount(dto.amount)
      const ledgerId = await this.resolveLedgerId(database, userId, dto.ledgerId)

      await this.validateCategory(database, userId, dto.categoryId, dto.type, true)
      await this.validateAccount(database, userId, dto.accountId, true)
      await this.validateTags(database, userId, dto.tagIds || [])

      const transaction = await database.transaction.create({
        data: {
          userId,
          type: dto.type,
          amount,
          transactionTime: new Date(dto.transactionTime),
          merchant: dto.merchant || null,
          description: dto.description || null,
          remark: dto.remark || null,
          ledgerId,
          categoryId: dto.categoryId || null,
          accountId: dto.accountId || null,
        },
      })

      await database.transactionSourceRecord.create({
        data: {
          userId: transaction.userId,
          transactionId: transaction.id,
          source: TransactionSource.MANUAL,
          sourceTransactionTime: transaction.transactionTime,
          sourceAmount: transaction.amount,
          rawData: Prisma.DbNull,
        },
      })

      if (dto.tagIds?.length) {
        await database.transactionTag.createMany({
          data: dto.tagIds.map((tagId) => ({
            userId,
            transactionId: transaction.id,
            tagId,
          })),
        })
      }

      const createdTransaction = await database.transaction.findUnique({
        where: { id: transaction.id },
        include: TRANSACTION_DETAIL_INCLUDE,
      })

      if (!createdTransaction) {
        throw new NotFoundException('账单创建失败')
      }

      return this.serializeDetail(createdTransaction)
    }, TRANSACTION_OPTIONS)
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    if (!Object.keys(dto).length) {
      throw new BadRequestException('至少提供一个可修改字段')
    }

    return this.prismaService.$transaction(async (database) => {
      const existing = await database.transaction.findFirst({
        where: { id, userId },
        include: {
          category: { select: { id: true, type: true, isActive: true } },
          account: { select: { id: true, isActive: true } },
        },
      })

      if (!existing) {
        throw new NotFoundException('账单不存在')
      }

      const targetType = dto.type ?? existing.type
      const targetCategoryId = dto.categoryId === undefined ? existing.categoryId : dto.categoryId

      if (targetCategoryId) {
        const categoryChanged = targetCategoryId !== existing.categoryId
        await this.validateCategory(database, userId, targetCategoryId, targetType, categoryChanged)
      }

      if (dto.accountId) {
        const accountChanged = dto.accountId !== existing.accountId
        await this.validateAccount(database, userId, dto.accountId, accountChanged)
      }

      if (dto.ledgerId !== undefined) {
        await this.resolveLedgerId(database, userId, dto.ledgerId)
      }

      if (dto.tagIds !== undefined) {
        await this.validateTags(database, userId, dto.tagIds)
      }

      await database.transaction.update({
        where: { id },
        data: {
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.amount !== undefined ? { amount: this.parseAmount(dto.amount) } : {}),
          ...(dto.transactionTime !== undefined
            ? { transactionTime: new Date(dto.transactionTime) }
            : {}),
          ...(dto.merchant !== undefined ? { merchant: dto.merchant || null } : {}),
          ...(dto.description !== undefined ? { description: dto.description || null } : {}),
          ...(dto.remark !== undefined ? { remark: dto.remark || null } : {}),
          ...(dto.ledgerId !== undefined ? { ledgerId: dto.ledgerId } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.accountId !== undefined ? { accountId: dto.accountId } : {}),
        },
      })

      if (dto.tagIds !== undefined) {
        await database.transactionTag.deleteMany({ where: { userId, transactionId: id } })

        if (dto.tagIds.length) {
          await database.transactionTag.createMany({
            data: dto.tagIds.map((tagId) => ({ userId, transactionId: id, tagId })),
          })
        }
      }

      const updatedTransaction = await database.transaction.findUnique({
        where: { id },
        include: TRANSACTION_DETAIL_INCLUDE,
      })

      if (!updatedTransaction) {
        throw new NotFoundException('账单不存在')
      }

      return this.serializeDetail(updatedTransaction)
    }, TRANSACTION_OPTIONS)
  }

  async remove(userId: string, id: string): Promise<void> {
    const transaction = await this.prismaService.transaction.findFirst({
      where: { id, userId },
      select: { id: true },
    })

    if (!transaction) {
      throw new NotFoundException('账单不存在')
    }

    await this.prismaService.transaction.delete({ where: { id } })
  }

  async batchDelete(userId: string, dto: BatchDeleteTransactionDto) {
    return this.prismaService.$transaction(async (database) => {
      await this.getOwnedTransactions(database, userId, dto.ids)
      const result = await database.transaction.deleteMany({
        where: { userId, id: { in: dto.ids } },
      })

      return { count: result.count }
    }, TRANSACTION_OPTIONS)
  }

  async batchUpdateCategory(userId: string, dto: BatchCategoryTransactionDto) {
    return this.prismaService.$transaction(async (database) => {
      const transactions = await this.getOwnedTransactions(database, userId, dto.ids)
      const category = await database.category.findFirst({
        where: { id: dto.categoryId, userId },
        select: { type: true, isActive: true },
      })

      if (!category) {
        throw new NotFoundException('分类不存在')
      }

      if (!category.isActive) {
        throw new BadRequestException('停用分类不能用于账单')
      }

      if (transactions.some((transaction) => transaction.type !== category.type)) {
        throw new BadRequestException('所选账单的收支类型与分类不一致')
      }

      const result = await database.transaction.updateMany({
        where: { userId, id: { in: dto.ids } },
        data: { categoryId: dto.categoryId },
      })

      return { count: result.count }
    }, TRANSACTION_OPTIONS)
  }

  async batchUpdateTags(userId: string, dto: BatchTagTransactionDto) {
    return this.prismaService.$transaction(async (database) => {
      await this.getOwnedTransactions(database, userId, dto.ids)
      await this.validateTags(database, userId, dto.tagIds)

      if (dto.mode === 'ADD') {
        await database.transactionTag.createMany({
          data: dto.ids.flatMap((transactionId) =>
            dto.tagIds.map((tagId) => ({ userId, transactionId, tagId })),
          ),
          skipDuplicates: true,
        })
      } else {
        await database.transactionTag.deleteMany({
          where: {
            userId,
            transactionId: { in: dto.ids },
            tagId: { in: dto.tagIds },
          },
        })
      }

      return { count: dto.ids.length }
    }, TRANSACTION_OPTIONS)
  }

  async batchUpdateLedger(userId: string, dto: BatchLedgerTransactionDto) {
    return this.prismaService.$transaction(async (database) => {
      await this.getOwnedTransactions(database, userId, dto.ids)
      await this.resolveLedgerId(database, userId, dto.ledgerId)
      const result = await database.transaction.updateMany({
        where: { userId, id: { in: dto.ids } },
        data: { ledgerId: dto.ledgerId },
      })

      return { count: result.count }
    }, TRANSACTION_OPTIONS)
  }

  private readonly buildListWhere = async (
    userId: string,
    query: QueryTransactionDto,
  ): Promise<Prisma.TransactionWhereInput> => {
    if (query.startDate && query.endDate && new Date(query.startDate) > new Date(query.endDate)) {
      throw new BadRequestException('开始时间不能晚于结束时间')
    }

    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.source ? { sourceRecords: { some: { source: query.source } } } : {}),
    }

    if (query.startDate || query.endDate) {
      where.transactionTime = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      }
    }

    if (query.ledgerId) {
      await this.ensureLedgerOwned(userId, query.ledgerId)
      where.ledgerId = query.ledgerId
    }

    if (query.accountId) {
      await this.ensureAccountOwned(userId, query.accountId)
      where.accountId = query.accountId
    }

    if (query.tagId) {
      await this.ensureTagOwned(userId, query.tagId)
      where.transactionTags = { some: { userId, tagId: query.tagId } }
    }

    if (query.categoryId) {
      const category = await this.prismaService.category.findFirst({
        where: { id: query.categoryId, userId },
        select: { id: true, parentId: true },
      })

      if (!category) {
        throw new NotFoundException('分类不存在')
      }

      if (category.parentId) {
        where.categoryId = category.id
      } else {
        const children = await this.prismaService.category.findMany({
          where: { userId, parentId: category.id },
          select: { id: true },
        })
        where.categoryId = { in: [category.id, ...children.map((item) => item.id)] }
      }
    }

    const keyword = query.keyword?.trim()
    if (keyword) {
      where.OR = [
        { remark: { contains: keyword, mode: 'insensitive' } },
        { merchant: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
        {
          sourceRecords: {
            some: {
              OR: [
                { sourceTransactionId: { contains: keyword, mode: 'insensitive' } },
                { sourceOrderId: { contains: keyword, mode: 'insensitive' } },
              ],
            },
          },
        },
      ]
    }

    return where
  }

  private readonly resolveLedgerId = async (
    database: Prisma.TransactionClient,
    userId: string,
    ledgerId?: string,
  ): Promise<string> => {
    if (ledgerId) {
      const ledger = await database.ledger.findFirst({
        where: { id: ledgerId, userId },
        select: { id: true },
      })

      if (!ledger) {
        throw new NotFoundException('账本不存在')
      }

      return ledger.id
    }

    const defaultLedgers = await database.ledger.findMany({
      where: { userId, isDefault: true },
      select: { id: true },
      take: 2,
    })

    if (defaultLedgers.length !== 1) {
      throw new ConflictException('当前用户默认账本状态异常')
    }

    return defaultLedgers[0]!.id
  }

  private readonly validateCategory = async (
    database: Prisma.TransactionClient,
    userId: string,
    categoryId: string | null | undefined,
    type: TransactionType,
    requireActive: boolean,
  ): Promise<void> => {
    if (!categoryId) return

    const category = await database.category.findFirst({
      where: { id: categoryId, userId },
      select: { type: true, isActive: true },
    })

    if (!category) {
      throw new NotFoundException('分类不存在')
    }

    if (category.type !== type) {
      throw new BadRequestException('账单收支类型与分类不一致')
    }

    if (requireActive && !category.isActive) {
      throw new BadRequestException('停用分类不能用于账单')
    }
  }

  private readonly validateAccount = async (
    database: Prisma.TransactionClient,
    userId: string,
    accountId: string | null | undefined,
    requireActive: boolean,
  ): Promise<void> => {
    if (!accountId) return

    const account = await database.account.findFirst({
      where: { id: accountId, userId },
      select: { isActive: true },
    })

    if (!account) {
      throw new NotFoundException('账户不存在')
    }

    if (requireActive && !account.isActive) {
      throw new BadRequestException('停用账户不能用于账单')
    }
  }

  private readonly validateTags = async (
    database: Prisma.TransactionClient,
    userId: string,
    tagIds: string[],
  ): Promise<void> => {
    if (!tagIds.length) return

    const tagCount = await database.tag.count({ where: { userId, id: { in: tagIds } } })
    if (tagCount !== tagIds.length) {
      throw new NotFoundException('标签不存在')
    }
  }

  private readonly getOwnedTransactions = async (
    database: Prisma.TransactionClient,
    userId: string,
    ids: string[],
  ) => {
    const transactions = await database.transaction.findMany({
      where: { userId, id: { in: ids } },
      select: { id: true, type: true },
    })

    if (transactions.length !== ids.length) {
      throw new NotFoundException('部分账单不存在')
    }

    return transactions
  }

  private readonly ensureLedgerOwned = async (userId: string, ledgerId: string): Promise<void> => {
    const ledger = await this.prismaService.ledger.findFirst({
      where: { id: ledgerId, userId },
      select: { id: true },
    })
    if (!ledger) throw new NotFoundException('账本不存在')
  }

  private readonly ensureAccountOwned = async (
    userId: string,
    accountId: string,
  ): Promise<void> => {
    const account = await this.prismaService.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    })
    if (!account) throw new NotFoundException('账户不存在')
  }

  private readonly ensureTagOwned = async (userId: string, tagId: string): Promise<void> => {
    const tag = await this.prismaService.tag.findFirst({
      where: { id: tagId, userId },
      select: { id: true },
    })
    if (!tag) throw new NotFoundException('标签不存在')
  }

  private readonly parseAmount = (value: string): Prisma.Decimal => {
    const amount = new Prisma.Decimal(value)
    if (!amount.isPositive()) {
      throw new BadRequestException('金额必须大于 0')
    }
    return amount
  }

  private readonly serializeListItem = (transaction: TransactionListItem) => {
    const { transactionTags, sourceRecords, ...transactionData } = transaction

    return {
      ...transactionData,
      amount: transaction.amount.toString(),
      tags: transactionTags.map((item) => item.tag),
      sources: sourceRecords,
    }
  }

  private readonly serializeDetail = (transaction: TransactionDetail) => {
    const { transactionTags, sourceRecords, ...transactionData } = transaction

    return {
      ...transactionData,
      amount: transaction.amount.toString(),
      tags: transactionTags.map((item) => item.tag),
      sources: sourceRecords.map((sourceRecord) => ({
        ...sourceRecord,
        sourceAmount: sourceRecord.sourceAmount.toString(),
      })),
    }
  }
}
