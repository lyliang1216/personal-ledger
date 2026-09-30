import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { Prisma } from '../generated/prisma/client'
import { TransactionType } from '../generated/prisma/enums'
import { PrismaService } from '../prisma/prisma.service'
import {
  CalendarStatisticsQueryDto,
  CategoryStatisticsQueryDto,
  StatisticsDateRangeDto,
  StatisticsRangeQueryDto,
  StatisticsScope,
  TopTransactionsQueryDto,
} from './dto/query-statistics.dto'
import type {
  DailyStatisticsItem,
  MonthlyStatisticsItem,
  StatisticsOverview,
} from './statistics.types'

interface ResolvedRange {
  startDate: Date
  endExclusive: Date
  ledgerId?: string
}

interface AggregateRow {
  expenseAmount: unknown
  incomeAmount: unknown
  refundAmount: unknown
  transactionCount?: unknown
  expenseCount?: unknown
  incomeCount?: unknown
  refundCount?: unknown
  count?: unknown
  netCashFlow?: unknown
}

interface TrendRow extends AggregateRow {
  bucket: string
}

interface DimensionRow {
  dimensionId: string | null
  dimensionName: string
  amount: unknown
  count: unknown
  percentage?: unknown
}

interface LedgerRow extends AggregateRow {
  ledgerId: string
  ledgerName: string
  isDefault: boolean
}

// 独立退款收入只有这一处事实判定。所有聚合查询均从 scoped CTE 读取该布尔值，
// 避免 overview、趋势、日历、账本和收入分类产生不同统计口径。
const standaloneRefundSql = Prisma.sql`
  t."type" = 'INCOME'
  AND EXISTS (
    SELECT 1
    FROM "TransactionSourceRecord" refund_source
    WHERE refund_source."transactionId" = t."id"
      AND refund_source."userId" = t."userId"
      AND refund_source."sourceRecordKind" = 'REFUND'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "TransactionSourceRecord" normal_source
    WHERE normal_source."transactionId" = t."id"
      AND normal_source."userId" = t."userId"
      AND normal_source."sourceRecordKind" = 'NORMAL'
  )
`

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(userId: string, query: StatisticsRangeQueryDto): Promise<StatisticsOverview> {
    const range = await this.resolveRange(userId, query)
    const [row] = await this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
      WITH scoped AS (${this.scopedTransactionsSql(userId, range)})
      SELECT
        COALESCE(SUM(CASE WHEN "type" = 'EXPENSE' THEN "amount" ELSE 0 END), 0) AS "expenseAmount",
        COALESCE(SUM(CASE WHEN "type" = 'INCOME' AND NOT "isStandaloneRefund" THEN "amount" ELSE 0 END), 0) AS "incomeAmount",
        COALESCE(SUM(CASE WHEN "isStandaloneRefund" THEN "amount" ELSE 0 END), 0) AS "refundAmount",
        COALESCE(SUM(CASE
          WHEN "type" = 'EXPENSE' THEN -"amount"
          WHEN "type" = 'INCOME' THEN "amount"
          ELSE 0
        END), 0) AS "netCashFlow",
        COUNT(*) AS "transactionCount",
        COUNT(*) FILTER (WHERE "type" = 'EXPENSE') AS "expenseCount",
        COUNT(*) FILTER (WHERE "type" = 'INCOME' AND NOT "isStandaloneRefund") AS "incomeCount",
        COUNT(*) FILTER (WHERE "isStandaloneRefund") AS "refundCount"
      FROM scoped
    `)

    return {
      expenseAmount: this.formatMoney(row?.expenseAmount),
      incomeAmount: this.formatMoney(row?.incomeAmount),
      refundAmount: this.formatMoney(row?.refundAmount),
      netCashFlow: this.formatMoney(row?.netCashFlow),
      transactionCount: this.toCount(row?.transactionCount),
      expenseCount: this.toCount(row?.expenseCount),
      incomeCount: this.toCount(row?.incomeCount),
      refundCount: this.toCount(row?.refundCount),
    }
  }

  async daily(userId: string, query: StatisticsRangeQueryDto): Promise<DailyStatisticsItem[]> {
    const range = await this.resolveRange(userId, query)
    const rows = await this.prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      WITH scoped AS (${this.scopedTransactionsSql(userId, range)}),
      aggregated AS (
        SELECT
          to_char(timezone('Asia/Shanghai', "transactionTime"), 'YYYY-MM-DD') AS bucket,
          SUM(CASE WHEN "type" = 'EXPENSE' THEN "amount" ELSE 0 END) AS "expenseAmount",
          SUM(CASE WHEN "type" = 'INCOME' AND NOT "isStandaloneRefund" THEN "amount" ELSE 0 END) AS "incomeAmount",
          SUM(CASE WHEN "isStandaloneRefund" THEN "amount" ELSE 0 END) AS "refundAmount",
          COUNT(*) AS count
        FROM scoped
        GROUP BY 1
      ),
      buckets AS (
        SELECT to_char(day, 'YYYY-MM-DD') AS bucket
        FROM generate_series(
          date_trunc('day', timezone('Asia/Shanghai', ${range.startDate}::timestamptz)),
          date_trunc('day', timezone('Asia/Shanghai', ${range.endExclusive}::timestamptz - interval '1 millisecond')),
          interval '1 day'
        ) AS day
      )
      SELECT
        buckets.bucket,
        COALESCE(aggregated."expenseAmount", 0) AS "expenseAmount",
        COALESCE(aggregated."incomeAmount", 0) AS "incomeAmount",
        COALESCE(aggregated."refundAmount", 0) AS "refundAmount",
        COALESCE(aggregated.count, 0) AS count
      FROM buckets
      LEFT JOIN aggregated USING (bucket)
      ORDER BY buckets.bucket
    `)

    return rows.map((row) => ({
      date: row.bucket,
      expenseAmount: this.formatMoney(row.expenseAmount),
      incomeAmount: this.formatMoney(row.incomeAmount),
      refundAmount: this.formatMoney(row.refundAmount),
      count: this.toCount(row.count),
    }))
  }

  async monthly(userId: string, query: StatisticsRangeQueryDto): Promise<MonthlyStatisticsItem[]> {
    const range = await this.resolveRange(userId, query)
    const rows = await this.prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      WITH scoped AS (${this.scopedTransactionsSql(userId, range)}),
      aggregated AS (
        SELECT
          to_char(timezone('Asia/Shanghai', "transactionTime"), 'YYYY-MM') AS bucket,
          SUM(CASE WHEN "type" = 'EXPENSE' THEN "amount" ELSE 0 END) AS "expenseAmount",
          SUM(CASE WHEN "type" = 'INCOME' AND NOT "isStandaloneRefund" THEN "amount" ELSE 0 END) AS "incomeAmount",
          SUM(CASE WHEN "isStandaloneRefund" THEN "amount" ELSE 0 END) AS "refundAmount",
          COUNT(*) AS count
        FROM scoped
        GROUP BY 1
      ),
      buckets AS (
        SELECT to_char(month, 'YYYY-MM') AS bucket
        FROM generate_series(
          date_trunc('month', timezone('Asia/Shanghai', ${range.startDate}::timestamptz)),
          date_trunc('month', timezone('Asia/Shanghai', ${range.endExclusive}::timestamptz - interval '1 millisecond')),
          interval '1 month'
        ) AS month
      )
      SELECT
        buckets.bucket,
        COALESCE(aggregated."expenseAmount", 0) AS "expenseAmount",
        COALESCE(aggregated."incomeAmount", 0) AS "incomeAmount",
        COALESCE(aggregated."refundAmount", 0) AS "refundAmount",
        COALESCE(aggregated.count, 0) AS count
      FROM buckets
      LEFT JOIN aggregated USING (bucket)
      ORDER BY buckets.bucket
    `)

    return rows.map((row) => ({
      month: row.bucket,
      expenseAmount: this.formatMoney(row.expenseAmount),
      incomeAmount: this.formatMoney(row.incomeAmount),
      refundAmount: this.formatMoney(row.refundAmount),
      count: this.toCount(row.count),
    }))
  }

  async categories(userId: string, query: CategoryStatisticsQueryDto) {
    const range = await this.resolveRange(userId, query)
    const categoryIdSql =
      query.level === 1
        ? Prisma.sql`CASE WHEN scoped."categoryId" IS NULL THEN NULL ELSE COALESCE(parent.id, category.id) END`
        : Prisma.sql`category.id`
    const categoryNameSql =
      query.level === 1
        ? Prisma.sql`COALESCE(parent.name, category.name, '未分类')`
        : Prisma.sql`COALESCE(category.name, '未分类')`
    const ordinaryIncomeFilter =
      query.type === TransactionType.INCOME
        ? Prisma.sql`AND NOT scoped."isStandaloneRefund"`
        : Prisma.empty

    const rows = await this.prisma.$queryRaw<DimensionRow[]>(Prisma.sql`
      WITH scoped AS (${this.scopedTransactionsSql(userId, range)}),
      grouped AS (
        SELECT
          ${categoryIdSql} AS "dimensionId",
          ${categoryNameSql} AS "dimensionName",
          SUM(scoped."amount") AS amount,
          COUNT(*) AS count
        FROM scoped
        LEFT JOIN "Category" category
          ON category.id = scoped."categoryId" AND category."userId" = scoped."userId"
        LEFT JOIN "Category" parent
          ON parent.id = category."parentId" AND parent."userId" = category."userId"
        WHERE scoped."type" = ${query.type}::"TransactionType"
          ${ordinaryIncomeFilter}
        GROUP BY 1, 2
      )
      SELECT
        "dimensionId",
        "dimensionName",
        amount,
        count,
        CASE
          WHEN SUM(amount) OVER () = 0 THEN 0
          ELSE ROUND(amount * 100 / SUM(amount) OVER (), 2)
        END AS percentage
      FROM grouped
      ORDER BY amount DESC, "dimensionName"
    `)

    return rows.map((row) => ({
      categoryId: row.dimensionId,
      categoryName: row.dimensionName,
      amount: this.formatMoney(row.amount),
      count: this.toCount(row.count),
      percentage: this.formatPercentage(row.percentage),
    }))
  }

  async tags(userId: string, query: StatisticsRangeQueryDto) {
    const range = await this.resolveRange(userId, query)
    const rows = await this.prisma.$queryRaw<DimensionRow[]>(Prisma.sql`
      WITH scoped AS (${this.scopedTransactionsSql(userId, range)})
      SELECT
        tag.id AS "dimensionId",
        tag.name AS "dimensionName",
        SUM(scoped."amount") AS amount,
        COUNT(*) AS count
      FROM scoped
      INNER JOIN "TransactionTag" transaction_tag
        ON transaction_tag."transactionId" = scoped.id
          AND transaction_tag."userId" = scoped."userId"
      INNER JOIN "Tag" tag
        ON tag.id = transaction_tag."tagId" AND tag."userId" = transaction_tag."userId"
      WHERE scoped."type" = 'EXPENSE'
      GROUP BY tag.id, tag.name
      ORDER BY amount DESC, tag.name
    `)

    return rows.map((row) => ({
      tagId: row.dimensionId,
      tagName: row.dimensionName,
      amount: this.formatMoney(row.amount),
      count: this.toCount(row.count),
    }))
  }

  async accounts(userId: string, query: StatisticsRangeQueryDto) {
    const range = await this.resolveRange(userId, query)
    const rows = await this.prisma.$queryRaw<DimensionRow[]>(Prisma.sql`
      WITH scoped AS (${this.scopedTransactionsSql(userId, range)})
      SELECT
        account.id AS "dimensionId",
        COALESCE(account.name, '未指定账户') AS "dimensionName",
        SUM(scoped."amount") AS amount,
        COUNT(*) AS count
      FROM scoped
      LEFT JOIN "Account" account
        ON account.id = scoped."accountId" AND account."userId" = scoped."userId"
      WHERE scoped."type" = 'EXPENSE'
      GROUP BY account.id, account.name
      ORDER BY amount DESC, "dimensionName"
    `)

    return rows.map((row) => ({
      accountId: row.dimensionId,
      accountName: row.dimensionName,
      amount: this.formatMoney(row.amount),
      count: this.toCount(row.count),
    }))
  }

  async ledgers(userId: string, query: StatisticsDateRangeDto) {
    const range = this.parseRange(query.startDate, query.endDate)
    const rows = await this.prisma.$queryRaw<LedgerRow[]>(Prisma.sql`
      WITH scoped AS (${this.scopedTransactionsSql(userId, range)})
      SELECT
        ledger.id AS "ledgerId",
        ledger.name AS "ledgerName",
        ledger."isDefault",
        COALESCE(SUM(CASE WHEN scoped."type" = 'EXPENSE' THEN scoped."amount" ELSE 0 END), 0) AS "expenseAmount",
        COALESCE(SUM(CASE WHEN scoped."type" = 'INCOME' AND NOT scoped."isStandaloneRefund" THEN scoped."amount" ELSE 0 END), 0) AS "incomeAmount",
        COALESCE(SUM(CASE WHEN scoped."isStandaloneRefund" THEN scoped."amount" ELSE 0 END), 0) AS "refundAmount",
        COUNT(scoped.id) AS count
      FROM "Ledger" ledger
      LEFT JOIN scoped ON scoped."ledgerId" = ledger.id
      WHERE ledger."userId" = ${userId}::uuid
      GROUP BY ledger.id, ledger.name, ledger."isDefault"
      ORDER BY ledger."isDefault" DESC, ledger."createdAt", ledger.id
    `)

    return rows.map((row) => ({
      ledgerId: row.ledgerId,
      ledgerName: row.ledgerName,
      isDefault: row.isDefault,
      expenseAmount: this.formatMoney(row.expenseAmount),
      incomeAmount: this.formatMoney(row.incomeAmount),
      refundAmount: this.formatMoney(row.refundAmount),
      count: this.toCount(row.count),
    }))
  }

  async calendar(
    userId: string,
    query: CalendarStatisticsQueryDto,
  ): Promise<DailyStatisticsItem[]> {
    const [yearText, monthText] = query.month.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    const nextYear = month === 12 ? year + 1 : year
    const nextMonth = month === 12 ? 1 : month + 1
    const startDate = new Date(`${query.month}-01T00:00:00.000+08:00`)
    const endExclusive = new Date(
      `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000+08:00`,
    )
    const ledgerId = await this.resolveLedgerId(userId, query)
    const range = { startDate, endExclusive, ledgerId }
    const rows = await this.prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      WITH scoped AS (${this.scopedTransactionsSql(userId, range)}),
      aggregated AS (
        SELECT
          to_char(timezone('Asia/Shanghai', "transactionTime"), 'YYYY-MM-DD') AS bucket,
          SUM(CASE WHEN "type" = 'EXPENSE' THEN "amount" ELSE 0 END) AS "expenseAmount",
          SUM(CASE WHEN "type" = 'INCOME' AND NOT "isStandaloneRefund" THEN "amount" ELSE 0 END) AS "incomeAmount",
          SUM(CASE WHEN "isStandaloneRefund" THEN "amount" ELSE 0 END) AS "refundAmount",
          COUNT(*) AS count
        FROM scoped
        GROUP BY 1
      ),
      buckets AS (
        SELECT to_char(day, 'YYYY-MM-DD') AS bucket
        FROM generate_series(
          date_trunc('day', timezone('Asia/Shanghai', ${startDate}::timestamptz)),
          date_trunc('day', timezone('Asia/Shanghai', ${endExclusive}::timestamptz - interval '1 millisecond')),
          interval '1 day'
        ) AS day
      )
      SELECT
        buckets.bucket,
        COALESCE(aggregated."expenseAmount", 0) AS "expenseAmount",
        COALESCE(aggregated."incomeAmount", 0) AS "incomeAmount",
        COALESCE(aggregated."refundAmount", 0) AS "refundAmount",
        COALESCE(aggregated.count, 0) AS count
      FROM buckets
      LEFT JOIN aggregated USING (bucket)
      ORDER BY buckets.bucket
    `)

    return rows.map((row) => ({
      date: row.bucket,
      expenseAmount: this.formatMoney(row.expenseAmount),
      incomeAmount: this.formatMoney(row.incomeAmount),
      refundAmount: this.formatMoney(row.refundAmount),
      count: this.toCount(row.count),
    }))
  }

  async topTransactions(userId: string, query: TopTransactionsQueryDto) {
    const range = await this.resolveRange(userId, query)
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        type: TransactionType.EXPENSE,
        amount: { gt: new Prisma.Decimal(0) },
        transactionTime: { gte: range.startDate, lt: range.endExclusive },
        ...(range.ledgerId ? { ledgerId: range.ledgerId } : {}),
      },
      orderBy: [{ amount: 'desc' }, { transactionTime: 'desc' }, { id: 'asc' }],
      take: query.limit,
      select: {
        id: true,
        transactionTime: true,
        amount: true,
        merchant: true,
        description: true,
        remark: true,
        category: { select: { id: true, name: true } },
        ledger: { select: { id: true, name: true } },
      },
    })

    return transactions.map((transaction) => ({
      ...transaction,
      amount: this.formatMoney(transaction.amount),
    }))
  }

  private async resolveRange(
    userId: string,
    query: StatisticsRangeQueryDto,
  ): Promise<ResolvedRange> {
    const range = this.parseRange(query.startDate, query.endDate)
    const ledgerId = await this.resolveLedgerId(userId, query)
    return { ...range, ledgerId }
  }

  private parseRange(
    startDateValue: string,
    endDateValue: string,
  ): Omit<ResolvedRange, 'ledgerId'> {
    const startDate = new Date(startDateValue)
    const parsedEndDate = new Date(endDateValue)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(parsedEndDate.getTime())) {
      throw new BadRequestException('统计时间范围无效。')
    }

    // 兼容既有“endDate 为包含边界”的 API 语义，并统一转换为数据库半开区间。
    // Transaction.transactionTime 为 Timestamptz(3)，增加 1ms 可完整包含传入的结束时刻。
    const endExclusive = new Date(parsedEndDate.getTime() + 1)
    if (startDate >= endExclusive) {
      throw new BadRequestException('startDate 必须早于或等于 endDate。')
    }

    return { startDate, endExclusive }
  }

  private async resolveLedgerId(
    userId: string,
    query: Pick<StatisticsRangeQueryDto, 'ledgerId' | 'scope'>,
  ): Promise<string | undefined> {
    if (query.ledgerId) {
      const ledger = await this.prisma.ledger.findFirst({
        where: { id: query.ledgerId, userId },
        select: { id: true },
      })
      if (!ledger) throw new NotFoundException('账本不存在。')
      return ledger.id
    }

    if (query.scope === StatisticsScope.ALL) return undefined

    const defaultLedgers = await this.prisma.ledger.findMany({
      where: { userId, isDefault: true },
      select: { id: true },
      take: 2,
    })
    if (defaultLedgers.length !== 1) {
      throw new ConflictException('当前用户默认账本状态异常，无法执行统计。')
    }
    return defaultLedgers[0].id
  }

  private scopedTransactionsSql(userId: string, range: ResolvedRange): Prisma.Sql {
    const ledgerFilter = range.ledgerId
      ? Prisma.sql`AND t."ledgerId" = ${range.ledgerId}::uuid`
      : Prisma.empty

    return Prisma.sql`
      SELECT t.*, (${standaloneRefundSql}) AS "isStandaloneRefund"
      FROM "Transaction" t
      WHERE t."userId" = ${userId}::uuid
        AND t."transactionTime" >= ${range.startDate}::timestamptz
        AND t."transactionTime" < ${range.endExclusive}::timestamptz
        ${ledgerFilter}
    `
  }

  private formatMoney(value: unknown): string {
    const decimal = new Prisma.Decimal(value?.toString() ?? 0)
    const [integer, fraction = ''] = decimal.toFixed(4).split('.')
    const trimmedFraction = fraction.replace(/0+$/, '')
    return `${integer}.${trimmedFraction.padEnd(2, '0')}`
  }

  private formatPercentage(value: unknown): string {
    return new Prisma.Decimal(value?.toString() ?? 0).toFixed(2)
  }

  private toCount(value: unknown): number {
    return Number(value?.toString() ?? 0)
  }
}
