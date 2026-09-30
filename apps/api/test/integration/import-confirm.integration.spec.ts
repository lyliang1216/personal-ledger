import 'dotenv/config'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { BadRequestException } from '@nestjs/common'

import { Prisma } from '../../src/generated/prisma/client'
import {
  AccountType,
  ImportRecordDecision,
  ImportRecordStatus,
  ImportReconcileStatus,
  ImportTaskStatus,
  SourceRecordKind,
  TransactionSource,
  TransactionType,
} from '../../src/generated/prisma/enums'
import { ImportConfirmService } from '../../src/imports/import-confirm.service'
import { PrismaService } from '../../src/prisma/prisma.service'

test('confirm 支持累计退款、超额回滚、CREATE_NEW 字段落库及 CHANGED 最小更新', async () => {
  const prisma = new PrismaService()
  const service = new ImportConfirmService(prisma)
  const userId = randomUUID()

  try {
    await prisma.user.create({ data: { id: userId, nickname: 'Import integration test' } })
    const ledger = await prisma.ledger.create({
      data: { userId, name: '测试账本', isDefault: true },
    })
    const category = await prisma.category.create({
      data: { userId, name: '测试分类', type: TransactionType.EXPENSE },
    })
    const account = await prisma.account.create({
      data: { userId, name: '测试账户', type: AccountType.WECHAT },
    })
    const tag = await prisma.tag.create({ data: { userId, name: '测试标签' } })

    const existingTransaction = await prisma.transaction.create({
      data: {
        userId,
        ledgerId: ledger.id,
        categoryId: category.id,
        accountId: account.id,
        type: TransactionType.EXPENSE,
        amount: new Prisma.Decimal(70),
        transactionTime: new Date('2026-09-01T00:00:00.000Z'),
        merchant: '原商户',
        description: '原说明',
        remark: '原备注',
      },
    })
    const normalSource = await prisma.transactionSourceRecord.create({
      data: {
        userId,
        transactionId: existingTransaction.id,
        source: TransactionSource.WECHAT,
        sourceTransactionId: `normal-${randomUUID()}`,
        sourceTransactionTime: new Date('2026-09-01T00:00:00.000Z'),
        sourceAmount: new Prisma.Decimal(100),
        sourceRecordKind: SourceRecordKind.NORMAL,
        rawData: { amount: 100 },
      },
    })
    await prisma.transactionSourceRecord.create({
      data: {
        userId,
        transactionId: existingTransaction.id,
        source: TransactionSource.WECHAT,
        sourceTransactionId: `refund-30-${randomUUID()}`,
        sourceTransactionTime: new Date('2026-09-02T00:00:00.000Z'),
        sourceAmount: new Prisma.Decimal(30),
        sourceRecordKind: SourceRecordKind.REFUND,
        rawData: { amount: 30 },
      },
    })

    const refundTask = await prisma.importTask.create({
      data: {
        userId,
        source: TransactionSource.WECHAT,
        fileName: 'refund-20.xlsx',
        status: ImportTaskStatus.PREVIEW,
      },
    })
    await prisma.importRecord.create({
      data: {
        importTaskId: refundTask.id,
        userId,
        source: TransactionSource.WECHAT,
        sourceTransactionId: `refund-20-${randomUUID()}`,
        sourceTransactionTime: new Date('2026-09-03T00:00:00.000Z'),
        sourceAmount: new Prisma.Decimal(20),
        sourceRecordKind: SourceRecordKind.REFUND,
        transactionTime: new Date('2026-09-03T00:00:00.000Z'),
        amount: new Prisma.Decimal(20),
        type: TransactionType.INCOME,
        merchant: '不应覆盖的商户',
        description: '不应覆盖的说明',
        remark: '不应覆盖的备注',
        ledgerId: ledger.id,
        categoryId: null,
        accountId: null,
        rawData: { amount: 20 },
        status: ImportRecordStatus.READY,
        reconcileStatus: ImportReconcileStatus.POSSIBLE_MATCH,
        decision: ImportRecordDecision.LINK_EXISTING,
        candidateTransactionId: existingTransaction.id,
        candidateSourceRecordId: normalSource.id,
      },
    })

    await service.confirm(userId, refundTask.id)
    const afterRefund = await prisma.transaction.findUniqueOrThrow({
      where: { id: existingTransaction.id },
    })
    assert.equal(afterRefund.amount.toFixed(), '50')
    assert.equal(afterRefund.merchant, '原商户')
    assert.equal(afterRefund.description, '原说明')
    assert.equal(afterRefund.remark, '原备注')
    assert.equal(afterRefund.categoryId, category.id)
    assert.equal(afterRefund.accountId, account.id)
    assert.equal(afterRefund.ledgerId, ledger.id)

    const overRefundTask = await prisma.importTask.create({
      data: {
        userId,
        source: TransactionSource.WECHAT,
        fileName: 'refund-over.xlsx',
        status: ImportTaskStatus.PREVIEW,
      },
    })
    const overRefundRecord = await prisma.importRecord.create({
      data: {
        importTaskId: overRefundTask.id,
        userId,
        source: TransactionSource.WECHAT,
        sourceTransactionId: `refund-80-${randomUUID()}`,
        sourceTransactionTime: new Date('2026-09-04T00:00:00.000Z'),
        sourceAmount: new Prisma.Decimal(80),
        sourceRecordKind: SourceRecordKind.REFUND,
        transactionTime: new Date('2026-09-04T00:00:00.000Z'),
        amount: new Prisma.Decimal(80),
        type: TransactionType.INCOME,
        ledgerId: ledger.id,
        rawData: { amount: 80 },
        status: ImportRecordStatus.READY,
        reconcileStatus: ImportReconcileStatus.POSSIBLE_MATCH,
        decision: ImportRecordDecision.LINK_EXISTING,
        candidateTransactionId: existingTransaction.id,
        candidateSourceRecordId: normalSource.id,
      },
    })

    await assert.rejects(
      service.confirm(userId, overRefundTask.id),
      (error: unknown) => error instanceof BadRequestException && /退款合计/.test(error.message),
    )
    const afterRejectedRefund = await prisma.transaction.findUniqueOrThrow({
      where: { id: existingTransaction.id },
    })
    assert.equal(afterRejectedRefund.amount.toFixed(), '50')
    assert.equal(
      await prisma.transactionSourceRecord.count({
        where: { userId, sourceTransactionId: overRefundRecord.sourceTransactionId },
      }),
      0,
    )
    assert.equal(
      (await prisma.importTask.findUniqueOrThrow({ where: { id: overRefundTask.id } })).status,
      ImportTaskStatus.PREVIEW,
    )

    const createTask = await prisma.importTask.create({
      data: {
        userId,
        source: TransactionSource.ALIPAY,
        fileName: 'create.csv',
        status: ImportTaskStatus.PREVIEW,
      },
    })
    const createRecord = await prisma.importRecord.create({
      data: {
        importTaskId: createTask.id,
        userId,
        source: TransactionSource.ALIPAY,
        sourceTransactionId: `create-${randomUUID()}`,
        sourceTransactionTime: new Date('2026-09-05T00:00:00.000Z'),
        sourceAmount: new Prisma.Decimal(25),
        sourceRecordKind: SourceRecordKind.NORMAL,
        transactionTime: new Date('2026-09-05T00:00:00.000Z'),
        amount: new Prisma.Decimal(25),
        type: TransactionType.EXPENSE,
        merchant: '新商户',
        description: '新说明',
        remark: '新备注',
        ledgerId: ledger.id,
        categoryId: category.id,
        accountId: account.id,
        rawData: { amount: 25 },
        status: ImportRecordStatus.READY,
        reconcileStatus: ImportReconcileStatus.NEW,
        decision: ImportRecordDecision.CREATE_NEW,
      },
    })
    await prisma.importRecordTag.create({
      data: { userId, importRecordId: createRecord.id, tagId: tag.id },
    })
    await service.confirm(userId, createTask.id)
    const createdSource = await prisma.transactionSourceRecord.findFirstOrThrow({
      where: { userId, sourceTransactionId: createRecord.sourceTransactionId },
    })
    const createdTransaction = await prisma.transaction.findUniqueOrThrow({
      where: { id: createdSource.transactionId },
      include: { transactionTags: true },
    })
    assert.equal(createdTransaction.merchant, '新商户')
    assert.equal(createdTransaction.description, '新说明')
    assert.equal(createdTransaction.remark, '新备注')
    assert.equal(createdTransaction.categoryId, category.id)
    assert.equal(createdTransaction.accountId, account.id)
    assert.equal(createdTransaction.ledgerId, ledger.id)
    assert.deepEqual(
      createdTransaction.transactionTags.map((item) => item.tagId),
      [tag.id],
    )

    const changedTransaction = await prisma.transaction.create({
      data: {
        userId,
        ledgerId: ledger.id,
        categoryId: category.id,
        accountId: account.id,
        type: TransactionType.EXPENSE,
        amount: new Prisma.Decimal(40),
        transactionTime: new Date('2026-09-06T00:00:00.000Z'),
        merchant: '保留商户',
        description: '保留说明',
        remark: '保留备注',
      },
    })
    const changedSource = await prisma.transactionSourceRecord.create({
      data: {
        userId,
        transactionId: changedTransaction.id,
        source: TransactionSource.ALIPAY,
        sourceTransactionId: `changed-${randomUUID()}`,
        sourceTransactionTime: new Date('2026-09-06T00:00:00.000Z'),
        sourceAmount: new Prisma.Decimal(40),
        sourceStatus: '旧状态',
        sourceRecordKind: SourceRecordKind.NORMAL,
        rawData: { version: 1 },
      },
    })
    const changedTask = await prisma.importTask.create({
      data: {
        userId,
        source: TransactionSource.ALIPAY,
        fileName: 'changed.csv',
        status: ImportTaskStatus.PREVIEW,
      },
    })
    await prisma.importRecord.create({
      data: {
        importTaskId: changedTask.id,
        userId,
        source: TransactionSource.ALIPAY,
        sourceTransactionId: changedSource.sourceTransactionId,
        sourceTransactionTime: changedSource.sourceTransactionTime,
        sourceAmount: new Prisma.Decimal(45),
        sourceStatus: '新状态',
        sourceRecordKind: SourceRecordKind.NORMAL,
        transactionTime: new Date('2026-09-07T00:00:00.000Z'),
        amount: new Prisma.Decimal(45),
        type: TransactionType.INCOME,
        merchant: '禁止覆盖商户',
        description: '禁止覆盖说明',
        remark: '禁止覆盖备注',
        ledgerId: ledger.id,
        rawData: { version: 2 },
        status: ImportRecordStatus.READY,
        reconcileStatus: ImportReconcileStatus.CHANGED,
        decision: ImportRecordDecision.APPLY_CHANGE,
        candidateTransactionId: changedTransaction.id,
        candidateSourceRecordId: changedSource.id,
      },
    })
    await service.confirm(userId, changedTask.id)
    const afterChange = await prisma.transaction.findUniqueOrThrow({
      where: { id: changedTransaction.id },
    })
    const afterChangedSource = await prisma.transactionSourceRecord.findUniqueOrThrow({
      where: { id: changedSource.id },
    })
    assert.equal(afterChange.amount.toFixed(), '40')
    assert.equal(afterChange.type, TransactionType.EXPENSE)
    assert.equal(afterChange.merchant, '保留商户')
    assert.equal(afterChange.description, '保留说明')
    assert.equal(afterChange.remark, '保留备注')
    assert.equal(afterChangedSource.sourceAmount.toFixed(), '45')
    assert.equal(afterChangedSource.sourceStatus, '新状态')
    assert.deepEqual(afterChangedSource.rawData, { version: 2 })

    const jdTransaction = await prisma.transaction.create({
      data: {
        userId,
        ledgerId: ledger.id,
        type: TransactionType.EXPENSE,
        amount: new Prisma.Decimal('941.4'),
        transactionTime: new Date('2026-09-08T00:00:00.000Z'),
        remark: '京东用户备注',
      },
    })
    const jdSource = await prisma.transactionSourceRecord.create({
      data: {
        userId,
        transactionId: jdTransaction.id,
        source: TransactionSource.JD,
        sourceTransactionId: `jd-${randomUUID()}`,
        sourceTransactionTime: jdTransaction.transactionTime,
        sourceAmount: new Prisma.Decimal('941.4'),
        sourceRecordKind: SourceRecordKind.NORMAL,
        rawData: { amount: '941.40' },
      },
    })

    for (const [fileName, amount] of [
      ['jd-partial.csv', '793.5'],
      ['jd-full.csv', '0'],
    ] as const) {
      const jdTask = await prisma.importTask.create({
        data: {
          userId,
          source: TransactionSource.JD,
          fileName,
          status: ImportTaskStatus.PREVIEW,
        },
      })
      await prisma.importRecord.create({
        data: {
          importTaskId: jdTask.id,
          userId,
          source: TransactionSource.JD,
          sourceTransactionId: jdSource.sourceTransactionId,
          sourceTransactionTime: jdSource.sourceTransactionTime,
          sourceAmount: new Prisma.Decimal('941.4'),
          sourceStatus: amount === '0' ? '已全额退款' : '已退款',
          sourceRecordKind: SourceRecordKind.NORMAL,
          transactionTime: jdTransaction.transactionTime,
          amount: new Prisma.Decimal(amount),
          type: TransactionType.EXPENSE,
          remark: '禁止覆盖京东备注',
          ledgerId: ledger.id,
          rawData: { amount },
          status: ImportRecordStatus.READY,
          reconcileStatus: ImportReconcileStatus.CHANGED,
          decision: ImportRecordDecision.APPLY_CHANGE,
          candidateTransactionId: jdTransaction.id,
          candidateSourceRecordId: jdSource.id,
        },
      })
      await service.confirm(userId, jdTask.id)
      const updatedJdTransaction = await prisma.transaction.findUniqueOrThrow({
        where: { id: jdTransaction.id },
      })
      assert.equal(updatedJdTransaction.amount.toFixed(), amount)
      assert.equal(updatedJdTransaction.remark, '京东用户备注')
    }

    const autoMatchTask = await prisma.importTask.create({
      data: {
        userId,
        source: TransactionSource.ALIPAY,
        fileName: 'auto-match.csv',
        status: ImportTaskStatus.PREVIEW,
      },
    })
    const autoSourceId = `auto-${randomUUID()}`
    await prisma.importRecord.create({
      data: {
        importTaskId: autoMatchTask.id,
        userId,
        source: TransactionSource.ALIPAY,
        sourceTransactionId: autoSourceId,
        sourceTransactionTime: normalSource.sourceTransactionTime,
        sourceAmount: normalSource.sourceAmount,
        sourceRecordKind: SourceRecordKind.NORMAL,
        transactionTime: normalSource.sourceTransactionTime,
        amount: normalSource.sourceAmount,
        type: TransactionType.EXPENSE,
        ledgerId: ledger.id,
        rawData: { auto: true },
        status: ImportRecordStatus.READY,
        reconcileStatus: ImportReconcileStatus.AUTO_MATCH,
        decision: ImportRecordDecision.LINK_EXISTING,
        candidateTransactionId: existingTransaction.id,
        candidateSourceRecordId: normalSource.id,
      },
    })
    const transactionCountBeforeAutoMatch = await prisma.transaction.count({ where: { userId } })
    await service.confirm(userId, autoMatchTask.id)
    assert.equal(
      await prisma.transaction.count({ where: { userId } }),
      transactionCountBeforeAutoMatch,
    )
    assert.equal(
      await prisma.transactionSourceRecord.count({
        where: { userId, transactionId: existingTransaction.id, sourceTransactionId: autoSourceId },
      }),
      1,
    )

    const standaloneRefundTask = await prisma.importTask.create({
      data: {
        userId,
        source: TransactionSource.WECHAT,
        fileName: 'standalone-refund.xlsx',
        status: ImportTaskStatus.PREVIEW,
      },
    })
    const standaloneRefundId = `standalone-refund-${randomUUID()}`
    await prisma.importRecord.create({
      data: {
        importTaskId: standaloneRefundTask.id,
        userId,
        source: TransactionSource.WECHAT,
        sourceTransactionId: standaloneRefundId,
        sourceTransactionTime: new Date('2026-09-09T00:00:00.000Z'),
        sourceAmount: new Prisma.Decimal(12),
        sourceRecordKind: SourceRecordKind.REFUND,
        transactionTime: new Date('2026-09-09T00:00:00.000Z'),
        amount: new Prisma.Decimal(12),
        type: TransactionType.INCOME,
        ledgerId: ledger.id,
        rawData: { refund: true },
        status: ImportRecordStatus.READY,
        reconcileStatus: ImportReconcileStatus.POSSIBLE_MATCH,
        decision: ImportRecordDecision.CREATE_NEW,
      },
    })
    await service.confirm(userId, standaloneRefundTask.id)
    const standaloneRefundSource = await prisma.transactionSourceRecord.findFirstOrThrow({
      where: { userId, sourceTransactionId: standaloneRefundId },
    })
    assert.equal(standaloneRefundSource.sourceRecordKind, SourceRecordKind.REFUND)
    assert.equal(
      (
        await prisma.transaction.findUniqueOrThrow({
          where: { id: standaloneRefundSource.transactionId },
        })
      ).type,
      TransactionType.INCOME,
    )

    await assert.rejects(service.confirm(userId, createTask.id), /已经完成/)
    await assert.rejects(service.confirm(randomUUID(), overRefundTask.id), /导入任务不存在/)
  } finally {
    await prisma.importTask.deleteMany({ where: { userId } })
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.category.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.tag.deleteMany({ where: { userId } })
    await prisma.ledger.deleteMany({ where: { userId } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  }
})
