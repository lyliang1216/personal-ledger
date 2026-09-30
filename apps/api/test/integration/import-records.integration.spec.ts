import 'dotenv/config'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { NotFoundException } from '@nestjs/common'

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
import { ImportTagBatchMode } from '../../src/imports/dto/import-record.dto'
import { ImportRecordsService } from '../../src/imports/import-records.service'
import { PrismaService } from '../../src/prisma/prisma.service'

test('ImportRecord 编辑、决策、批量整理、忽略恢复和多用户隔离', async () => {
  const prisma = new PrismaService()
  const service = new ImportRecordsService(prisma)
  const userId = randomUUID()
  const otherUserId = randomUUID()

  try {
    await prisma.user.createMany({
      data: [
        { id: userId, nickname: 'Import records integration test' },
        { id: otherUserId, nickname: 'Other integration test user' },
      ],
    })
    const ledger = await prisma.ledger.create({
      data: { userId, name: '原账本', isDefault: true },
    })
    const targetLedger = await prisma.ledger.create({
      data: { userId, name: '目标账本' },
    })
    const category = await prisma.category.create({
      data: { userId, name: '批量分类', type: TransactionType.EXPENSE },
    })
    const account = await prisma.account.create({
      data: { userId, name: '批量账户', type: AccountType.ALIPAY },
    })
    const tag = await prisma.tag.create({ data: { userId, name: '批量标签' } })
    const task = await prisma.importTask.create({
      data: {
        userId,
        source: TransactionSource.ALIPAY,
        fileName: 'batch.csv',
        status: ImportTaskStatus.PREVIEW,
      },
    })
    const records = await Promise.all(
      [1, 2].map((index) =>
        prisma.importRecord.create({
          data: {
            importTaskId: task.id,
            userId,
            source: TransactionSource.ALIPAY,
            sourceTransactionId: `batch-${index}-${randomUUID()}`,
            sourceTransactionTime: new Date(`2026-09-0${index}T00:00:00.000Z`),
            sourceAmount: new Prisma.Decimal(10 * index),
            sourceRecordKind: SourceRecordKind.NORMAL,
            transactionTime: new Date(`2026-09-0${index}T00:00:00.000Z`),
            amount: new Prisma.Decimal(10 * index),
            type: TransactionType.EXPENSE,
            merchant: `商户 ${index}`,
            remark: `原备注 ${index}`,
            ledgerId: ledger.id,
            rawData: { index, immutable: true },
            status: ImportRecordStatus.READY,
            reconcileStatus: ImportReconcileStatus.NEW,
            decision: ImportRecordDecision.CREATE_NEW,
          },
        }),
      ),
    )
    const ids = records.map((record) => record.id)

    await service.batchCategory(userId, { ids, categoryId: category.id })
    await service.batchTags(userId, { ids, tagIds: [tag.id], mode: ImportTagBatchMode.ADD })
    await service.batchLedger(userId, { ids, ledgerId: targetLedger.id })
    await service.batchAccount(userId, { ids, accountId: account.id })
    const organized = await prisma.importRecord.findMany({
      where: { id: { in: ids } },
      orderBy: { sourceAmount: 'asc' },
    })
    assert.equal(
      organized.every((record) => record.categoryId === category.id),
      true,
    )
    assert.equal(
      organized.every((record) => record.ledgerId === targetLedger.id),
      true,
    )
    assert.equal(
      organized.every((record) => record.accountId === account.id),
      true,
    )
    assert.equal(
      await prisma.importRecordTag.count({ where: { userId, importRecordId: { in: ids } } }),
      2,
    )

    await service.batchTags(userId, { ids, tagIds: [tag.id], mode: ImportTagBatchMode.REMOVE })
    assert.equal(
      await prisma.importRecordTag.count({ where: { userId, importRecordId: { in: ids } } }),
      0,
    )

    await service.update(userId, records[0]!.id, { remark: '用户整理后的备注' })
    const edited = await prisma.importRecord.findUniqueOrThrow({ where: { id: records[0]!.id } })
    assert.equal(edited.remark, '用户整理后的备注')
    assert.deepEqual(edited.rawData, { index: 1, immutable: true })

    await service.batchIgnore(userId, { ids })
    assert.equal(
      await prisma.importRecord.count({
        where: { id: { in: ids }, status: ImportRecordStatus.IGNORED },
      }),
      2,
    )
    await service.batchRestore(userId, { ids })
    assert.equal(
      await prisma.importRecord.count({
        where: { id: { in: ids }, status: ImportRecordStatus.READY },
      }),
      2,
    )

    const candidateTransaction = await prisma.transaction.create({
      data: {
        userId,
        ledgerId: ledger.id,
        type: TransactionType.EXPENSE,
        amount: new Prisma.Decimal(30),
        transactionTime: new Date('2026-09-03T00:00:00.000Z'),
        merchant: '候选账单',
      },
    })
    const candidateSource = await prisma.transactionSourceRecord.create({
      data: {
        userId,
        transactionId: candidateTransaction.id,
        source: TransactionSource.WECHAT,
        sourceTransactionTime: new Date('2026-09-03T00:00:00.000Z'),
        sourceAmount: new Prisma.Decimal(30),
        sourceRecordKind: SourceRecordKind.NORMAL,
      },
    })
    const possibleRecord = await prisma.importRecord.create({
      data: {
        importTaskId: task.id,
        userId,
        source: TransactionSource.ALIPAY,
        sourceTransactionTime: new Date('2026-09-03T00:00:10.000Z'),
        sourceAmount: new Prisma.Decimal(30),
        sourceRecordKind: SourceRecordKind.NORMAL,
        transactionTime: new Date('2026-09-03T00:00:10.000Z'),
        amount: new Prisma.Decimal(30),
        type: TransactionType.EXPENSE,
        ledgerId: ledger.id,
        rawData: { candidate: true },
        status: ImportRecordStatus.READY,
        reconcileStatus: ImportReconcileStatus.POSSIBLE_MATCH,
      },
    })
    const candidates = await service.findCandidates(userId, possibleRecord.id)
    assert.equal(
      candidates.some((candidate) => candidate.id === candidateTransaction.id),
      true,
    )
    await service.updateDecision(userId, possibleRecord.id, {
      decision: ImportRecordDecision.LINK_EXISTING,
      candidateTransactionId: candidateTransaction.id,
      candidateSourceRecordId: candidateSource.id,
    })
    let decided = await prisma.importRecord.findUniqueOrThrow({ where: { id: possibleRecord.id } })
    assert.equal(decided.decision, ImportRecordDecision.LINK_EXISTING)
    assert.equal(decided.candidateSourceRecordId, candidateSource.id)
    await service.updateDecision(userId, possibleRecord.id, {
      decision: ImportRecordDecision.CREATE_NEW,
    })
    decided = await prisma.importRecord.findUniqueOrThrow({ where: { id: possibleRecord.id } })
    assert.equal(decided.decision, ImportRecordDecision.CREATE_NEW)
    assert.equal(decided.candidateTransactionId, null)

    await assert.rejects(
      service.findOne(otherUserId, records[0]!.id),
      (error: unknown) => error instanceof NotFoundException,
    )
  } finally {
    await prisma.importTask.deleteMany({ where: { userId } })
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.category.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.tag.deleteMany({ where: { userId } })
    await prisma.ledger.deleteMany({ where: { userId } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
    await prisma.$disconnect()
  }
})
