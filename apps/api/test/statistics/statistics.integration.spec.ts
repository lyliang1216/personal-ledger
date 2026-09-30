import 'dotenv/config'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { Prisma } from '../../src/generated/prisma/client'
import {
  AccountType,
  SourceRecordKind,
  TransactionSource,
  TransactionType,
} from '../../src/generated/prisma/enums'
import { PrismaService } from '../../src/prisma/prisma.service'
import { StatisticsScope } from '../../src/statistics/dto/query-statistics.dto'
import { StatisticsService } from '../../src/statistics/statistics.service'

const amountSum = (values: string[]): Prisma.Decimal =>
  values.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0))

test(
  '统计 API 保持账本、退款、来源去重、维度和 Asia/Shanghai 口径一致',
  { timeout: 120_000 },
  async () => {
    const prisma = new PrismaService()
    const service = new StatisticsService(prisma)
    const userId = randomUUID()
    const otherUserId = randomUUID()

    try {
      await prisma.user.createMany({
        data: [
          { id: userId, nickname: 'Statistics integration test' },
          { id: otherUserId, nickname: 'Statistics isolation test' },
        ],
      })

      const defaultLedger = await prisma.ledger.create({
        data: { userId, name: '默认账本', isDefault: true },
      })
      const specialLedger = await prisma.ledger.create({
        data: { userId, name: '特殊账本', isDefault: false },
      })
      const otherLedger = await prisma.ledger.create({
        data: { userId: otherUserId, name: '其他用户账本', isDefault: true },
      })
      const food = await prisma.category.create({
        data: { userId, name: '餐饮', type: TransactionType.EXPENSE },
      })
      const breakfast = await prisma.category.create({
        data: {
          userId,
          parentId: food.id,
          name: '早餐',
          type: TransactionType.EXPENSE,
        },
      })
      const lunch = await prisma.category.create({
        data: { userId, parentId: food.id, name: '午餐', type: TransactionType.EXPENSE },
      })
      const shopping = await prisma.category.create({
        data: { userId, name: '购物', type: TransactionType.EXPENSE },
      })
      const salary = await prisma.category.create({
        data: { userId, name: '工资', type: TransactionType.INCOME },
      })
      const wallet = await prisma.account.create({
        data: { userId, name: '日常账户', type: AccountType.WECHAT },
      })
      const familyTag = await prisma.tag.create({ data: { userId, name: '家庭' } })
      const childTag = await prisma.tag.create({ data: { userId, name: '孩子' } })

      const createTransaction = (data: {
        ledgerId?: string
        categoryId?: string | null
        accountId?: string | null
        type?: TransactionType
        amount: string
        time: string
        merchant: string
      }) =>
        prisma.transaction.create({
          data: {
            userId,
            ledgerId: data.ledgerId ?? defaultLedger.id,
            categoryId: data.categoryId,
            accountId: data.accountId,
            type: data.type ?? TransactionType.EXPENSE,
            amount: new Prisma.Decimal(data.amount),
            transactionTime: new Date(data.time),
            merchant: data.merchant,
            description: `${data.merchant}说明`,
            remark: `${data.merchant}备注`,
          },
        })

      const breakfastExpense = await createTransaction({
        categoryId: breakfast.id,
        accountId: wallet.id,
        amount: '100',
        time: '2026-09-01T08:00:00+08:00',
        merchant: '早餐店',
      })
      const lunchExpense = await createTransaction({
        categoryId: lunch.id,
        accountId: wallet.id,
        amount: '200',
        time: '2026-09-02T12:00:00+08:00',
        merchant: '午餐店',
      })
      await createTransaction({
        categoryId: null,
        accountId: null,
        amount: '50',
        time: '2026-09-03T12:00:00+08:00',
        merchant: '未整理消费',
      })
      const partialRefundExpense = await createTransaction({
        categoryId: food.id,
        accountId: wallet.id,
        amount: '70',
        time: '2026-09-04T12:00:00+08:00',
        merchant: '部分退款消费',
      })
      const fullRefundExpense = await createTransaction({
        categoryId: food.id,
        accountId: wallet.id,
        amount: '0',
        time: '2026-09-05T12:00:00+08:00',
        merchant: '全额退款消费',
      })
      const multiSourceExpense = await createTransaction({
        categoryId: shopping.id,
        accountId: wallet.id,
        amount: '149',
        time: '2026-09-30T23:59:00+08:00',
        merchant: '跨平台消费',
      })
      await createTransaction({
        ledgerId: specialLedger.id,
        categoryId: shopping.id,
        accountId: wallet.id,
        amount: '500',
        time: '2026-09-10T12:00:00+08:00',
        merchant: '特殊账本消费',
      })
      await createTransaction({
        categoryId: shopping.id,
        amount: '999',
        time: '2026-10-01T00:00:00+08:00',
        merchant: '十月边界消费',
      })
      await createTransaction({
        categoryId: shopping.id,
        amount: '10',
        time: '2025-12-15T12:00:00+08:00',
        merchant: '跨年十二月',
      })
      await createTransaction({
        categoryId: shopping.id,
        amount: '20',
        time: '2026-01-15T12:00:00+08:00',
        merchant: '跨年一月',
      })

      const ordinaryIncome = await createTransaction({
        categoryId: salary.id,
        type: TransactionType.INCOME,
        amount: '1000',
        time: '2026-09-06T12:00:00+08:00',
        merchant: '工资',
      })
      const standaloneRefund = await createTransaction({
        type: TransactionType.INCOME,
        amount: '100',
        time: '2026-09-07T12:00:00+08:00',
        merchant: '独立退款',
      })
      const mixedSourceIncome = await createTransaction({
        categoryId: salary.id,
        type: TransactionType.INCOME,
        amount: '40',
        time: '2026-09-08T12:00:00+08:00',
        merchant: '普通混合来源收入',
      })

      await prisma.transactionSourceRecord.createMany({
        data: [
          {
            userId,
            transactionId: partialRefundExpense.id,
            source: TransactionSource.WECHAT,
            sourceTransactionTime: partialRefundExpense.transactionTime,
            sourceAmount: new Prisma.Decimal(100),
            sourceRecordKind: SourceRecordKind.NORMAL,
          },
          {
            userId,
            transactionId: partialRefundExpense.id,
            source: TransactionSource.WECHAT,
            sourceTransactionTime: partialRefundExpense.transactionTime,
            sourceAmount: new Prisma.Decimal(30),
            sourceRecordKind: SourceRecordKind.REFUND,
          },
          {
            userId,
            transactionId: fullRefundExpense.id,
            source: TransactionSource.JD,
            sourceTransactionTime: fullRefundExpense.transactionTime,
            sourceAmount: new Prisma.Decimal(100),
            sourceRecordKind: SourceRecordKind.NORMAL,
          },
          {
            userId,
            transactionId: fullRefundExpense.id,
            source: TransactionSource.JD,
            sourceTransactionTime: fullRefundExpense.transactionTime,
            sourceAmount: new Prisma.Decimal(100),
            sourceRecordKind: SourceRecordKind.REFUND,
          },
          {
            userId,
            transactionId: multiSourceExpense.id,
            source: TransactionSource.JD,
            sourceTransactionTime: multiSourceExpense.transactionTime,
            sourceAmount: new Prisma.Decimal(149),
            sourceRecordKind: SourceRecordKind.NORMAL,
          },
          {
            userId,
            transactionId: multiSourceExpense.id,
            source: TransactionSource.WECHAT,
            sourceTransactionTime: multiSourceExpense.transactionTime,
            sourceAmount: new Prisma.Decimal(149),
            sourceRecordKind: SourceRecordKind.NORMAL,
          },
          {
            userId,
            transactionId: ordinaryIncome.id,
            source: TransactionSource.MANUAL,
            sourceTransactionTime: ordinaryIncome.transactionTime,
            sourceAmount: ordinaryIncome.amount,
            sourceRecordKind: SourceRecordKind.NORMAL,
          },
          {
            userId,
            transactionId: standaloneRefund.id,
            source: TransactionSource.WECHAT,
            sourceTransactionTime: standaloneRefund.transactionTime,
            sourceAmount: standaloneRefund.amount,
            sourceRecordKind: SourceRecordKind.REFUND,
          },
          {
            userId,
            transactionId: mixedSourceIncome.id,
            source: TransactionSource.WECHAT,
            sourceTransactionTime: mixedSourceIncome.transactionTime,
            sourceAmount: mixedSourceIncome.amount,
            sourceRecordKind: SourceRecordKind.NORMAL,
          },
          {
            userId,
            transactionId: mixedSourceIncome.id,
            source: TransactionSource.WECHAT,
            sourceTransactionTime: mixedSourceIncome.transactionTime,
            sourceAmount: new Prisma.Decimal(5),
            sourceRecordKind: SourceRecordKind.REFUND,
          },
        ],
      })
      await prisma.transactionTag.createMany({
        data: [
          { userId, transactionId: breakfastExpense.id, tagId: familyTag.id },
          { userId, transactionId: breakfastExpense.id, tagId: childTag.id },
          { userId, transactionId: lunchExpense.id, tagId: familyTag.id },
        ],
      })
      await prisma.transaction.create({
        data: {
          userId: otherUserId,
          ledgerId: otherLedger.id,
          type: TransactionType.EXPENSE,
          amount: new Prisma.Decimal(777),
          transactionTime: new Date('2026-09-15T12:00:00+08:00'),
          merchant: '其他用户消费',
        },
      })

      const septemberDefault = {
        startDate: '2026-09-01T00:00:00+08:00',
        endDate: '2026-09-30T23:59:59.999+08:00',
        scope: StatisticsScope.DEFAULT,
      }
      const septemberAll = { ...septemberDefault, scope: StatisticsScope.ALL }
      const overview = await service.overview(userId, septemberDefault)
      assert.deepEqual(overview, {
        expenseAmount: '569.00',
        incomeAmount: '1040.00',
        refundAmount: '100.00',
        netCashFlow: '571.00',
        transactionCount: 9,
        expenseCount: 6,
        incomeCount: 2,
        refundCount: 1,
      })

      const allOverview = await service.overview(userId, septemberAll)
      assert.equal(allOverview.expenseAmount, '1069.00')
      assert.equal(allOverview.transactionCount, 10)
      const specialOverview = await service.overview(userId, {
        ...septemberDefault,
        scope: StatisticsScope.ALL,
        ledgerId: specialLedger.id,
      })
      assert.equal(specialOverview.expenseAmount, '500.00')

      const otherOverview = await service.overview(otherUserId, septemberDefault)
      assert.equal(otherOverview.expenseAmount, '777.00')
      assert.equal(otherOverview.transactionCount, 1)

      const daily = await service.daily(userId, septemberDefault)
      assert.equal(daily.length, 30)
      assert.deepEqual(
        daily.find((item) => item.date === '2026-09-30'),
        {
          date: '2026-09-30',
          expenseAmount: '149.00',
          incomeAmount: '0.00',
          refundAmount: '0.00',
          count: 1,
        },
      )
      assert.equal(
        daily.some((item) => item.date === '2026-10-01'),
        false,
      )
      assert.equal(amountSum(daily.map((item) => item.expenseAmount)).toFixed(2), '569.00')

      const monthly = await service.monthly(userId, septemberDefault)
      assert.deepEqual(monthly, [
        {
          month: '2026-09',
          expenseAmount: '569.00',
          incomeAmount: '1040.00',
          refundAmount: '100.00',
          count: 9,
        },
      ])
      const crossYear = await service.monthly(userId, {
        startDate: '2025-12-01T00:00:00+08:00',
        endDate: '2026-02-28T23:59:59.999+08:00',
        scope: StatisticsScope.DEFAULT,
      })
      assert.deepEqual(
        crossYear.map((item) => [item.month, item.expenseAmount]),
        [
          ['2025-12', '10.00'],
          ['2026-01', '20.00'],
          ['2026-02', '0.00'],
        ],
      )

      const categoryLevel1 = await service.categories(userId, {
        ...septemberDefault,
        type: TransactionType.EXPENSE,
        level: 1,
      })
      assert.equal(categoryLevel1.find((item) => item.categoryId === food.id)?.amount, '370.00')
      assert.equal(categoryLevel1.find((item) => item.categoryId === null)?.amount, '50.00')
      assert.equal(
        amountSum(categoryLevel1.map((item) => item.amount)).toFixed(2),
        overview.expenseAmount,
      )
      const categoryLevel2 = await service.categories(userId, {
        ...septemberDefault,
        type: TransactionType.EXPENSE,
        level: 2,
      })
      assert.equal(
        categoryLevel2.find((item) => item.categoryId === breakfast.id)?.amount,
        '100.00',
      )
      assert.equal(categoryLevel2.find((item) => item.categoryId === lunch.id)?.amount, '200.00')
      const incomeCategories = await service.categories(userId, {
        ...septemberDefault,
        type: TransactionType.INCOME,
        level: 1,
      })
      assert.equal(amountSum(incomeCategories.map((item) => item.amount)).toFixed(2), '1040.00')

      const tags = await service.tags(userId, septemberDefault)
      assert.equal(tags.find((item) => item.tagId === familyTag.id)?.amount, '300.00')
      assert.equal(tags.find((item) => item.tagId === childTag.id)?.amount, '100.00')
      assert.equal(amountSum(tags.map((item) => item.amount)).toFixed(2), '400.00')

      const accounts = await service.accounts(userId, septemberDefault)
      assert.equal(accounts.find((item) => item.accountId === wallet.id)?.amount, '519.00')
      assert.equal(accounts.find((item) => item.accountId === null)?.amount, '50.00')

      const ledgers = await service.ledgers(userId, septemberDefault)
      assert.equal(
        ledgers.find((item) => item.ledgerId === defaultLedger.id)?.expenseAmount,
        '569.00',
      )
      assert.equal(
        ledgers.find((item) => item.ledgerId === specialLedger.id)?.expenseAmount,
        '500.00',
      )
      assert.equal(
        ledgers.find((item) => item.ledgerId === defaultLedger.id)?.refundAmount,
        '100.00',
      )

      const calendar = await service.calendar(userId, {
        month: '2026-09',
        scope: StatisticsScope.DEFAULT,
      })
      assert.equal(calendar.length, 30)
      assert.equal(calendar.find((item) => item.date === '2026-09-07')?.refundAmount, '100.00')
      assert.equal(amountSum(calendar.map((item) => item.expenseAmount)).toFixed(2), '569.00')

      const topTransactions = await service.topTransactions(userId, {
        ...septemberAll,
        limit: 2,
      })
      assert.deepEqual(
        topTransactions.map((item) => item.amount),
        ['500.00', '200.00'],
      )
      assert.equal(topTransactions[0]?.ledger.id, specialLedger.id)

      // 每个统计接口都通过服务层相同 userId 谓词隔离，以下逐项确认不会出现用户 A 数据。
      const otherDaily = await service.daily(otherUserId, septemberDefault)
      const otherMonthly = await service.monthly(otherUserId, septemberDefault)
      const otherCategories = await service.categories(otherUserId, {
        ...septemberDefault,
        type: TransactionType.EXPENSE,
        level: 1,
      })
      const otherTags = await service.tags(otherUserId, septemberDefault)
      const otherAccounts = await service.accounts(otherUserId, septemberDefault)
      const otherLedgers = await service.ledgers(otherUserId, septemberDefault)
      const otherCalendar = await service.calendar(otherUserId, {
        month: '2026-09',
        scope: StatisticsScope.DEFAULT,
      })
      const otherTop = await service.topTransactions(otherUserId, {
        ...septemberDefault,
        limit: 10,
      })
      assert.equal(amountSum(otherDaily.map((item) => item.expenseAmount)).toFixed(2), '777.00')
      assert.equal(otherMonthly[0]?.expenseAmount, '777.00')
      assert.equal(otherCategories[0]?.amount, '777.00')
      assert.deepEqual(otherTags, [])
      assert.equal(otherAccounts[0]?.amount, '777.00')
      assert.equal(otherLedgers[0]?.expenseAmount, '777.00')
      assert.equal(amountSum(otherCalendar.map((item) => item.expenseAmount)).toFixed(2), '777.00')
      assert.deepEqual(
        otherTop.map((item) => item.amount),
        ['777.00'],
      )
    } finally {
      await prisma.transaction.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
      await prisma.category.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
      await prisma.account.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
      await prisma.tag.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
      await prisma.ledger.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
      await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
      await prisma.$disconnect()
    }
  },
)
