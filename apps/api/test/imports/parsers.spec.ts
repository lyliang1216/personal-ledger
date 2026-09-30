import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

import ExcelJS = require('exceljs')
import iconv = require('iconv-lite')

import {
  ImportRecordStatus,
  ImportReconcileStatus,
  SourceRecordKind,
  TransactionSource,
} from '../../src/generated/prisma/enums'
import { AlipayBillParser } from '../../src/imports/parsers/alipay-bill.parser'
import { BillParserRegistry } from '../../src/imports/parsers/bill-parser.registry'
import { JdBillParser } from '../../src/imports/parsers/jd-bill.parser'
import { WechatBillParser } from '../../src/imports/parsers/wechat-bill.parser'

const fixturePath = (fileName: string): string =>
  join(process.cwd(), 'test', 'fixtures', 'imports', fileName)

const createWechatFixture = async (): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('微信支付账单')
  worksheet.addRow(['微信支付账单明细'])
  worksheet.addRow(['导出时间：2026-09-30 09:00:00'])
  worksheet.addRow([])
  worksheet.addRow([
    '交易时间',
    '交易类型',
    '交易对方',
    '商品',
    '收/支',
    '金额(元)',
    '支付方式',
    '当前状态',
    '交易单号',
    '商户单号',
    '备注',
  ])
  worksheet.addRow([
    '2026-09-21 23:42:03',
    '商户消费',
    '示例京东商户',
    '京东支付',
    '支出',
    '¥149.00',
    '零钱',
    '支付成功',
    'WX-DEMO-001',
    'WX-MERCHANT-001',
    '',
  ])
  worksheet.addRow([
    '2026-09-22 09:00:00',
    '二维码收款',
    '示例用户',
    '测试收款',
    '收入',
    '￥20.00',
    '零钱',
    '已收钱',
    'WX-DEMO-002',
    'WX-MERCHANT-002',
    '',
  ])
  worksheet.addRow([
    '2026-09-23 09:00:00',
    '退款',
    '示例商户',
    '退款-示例商品',
    '收入',
    '￥57.80',
    '零钱',
    '已全额退款',
    'WX-DEMO-003',
    'WX-MERCHANT-003',
    '',
  ])
  worksheet.addRow([
    '2026-09-23 10:00:00',
    '商户消费',
    '示例商户',
    '未知状态样本',
    '支出',
    '￥10.00',
    '零钱',
    '等待人工核验',
    'WX-DEMO-004',
    'WX-MERCHANT-004',
    '',
  ])

  const content = await workbook.xlsx.writeBuffer()
  return Buffer.from(content)
}

test('支付宝 Parser 兼容 UTF-8 BOM 与 GB18030，并区分 IGNORED/UNSUPPORTED', async () => {
  const parser = new AlipayBillParser()
  const fixture = await readFile(fixturePath('alipay.csv'))
  const bomFixture = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fixture])
  const gb18030Fixture = iconv.encode(fixture.toString('utf8'), 'gb18030')

  for (const [fileName, buffer] of [
    ['alipay-utf8-bom.csv', bomFixture],
    ['alipay-gb18030.csv', gb18030Fixture],
  ] as const) {
    const input = { fileName, mimeType: 'text/csv', buffer }
    assert.equal(await parser.canParse(input), true)
    const parsed = await parser.parse(input)
    assert.equal(parsed.source, TransactionSource.ALIPAY)
    assert.equal(parsed.records.length, 4)
    assert.equal(parsed.records[0]?.paymentMethod, '花呗')
    assert.equal(parsed.records[0]?.rawData['收/付款方式'], '花呗&碰一下立减')
    assert.equal(parsed.records[2]?.status, ImportRecordStatus.IGNORED)
    assert.equal(parsed.records[3]?.status, ImportRecordStatus.READY)
    assert.equal(parsed.records[3]?.reconcileStatus, ImportReconcileStatus.UNSUPPORTED)
  }
})

test('京东 Parser 保持 sourceAmount 并使用 Decimal 计算部分退款净额', async () => {
  const parser = new JdBillParser()
  const buffer = await readFile(fixturePath('jd.csv'))
  const parsed = await parser.parse({ fileName: 'jd.csv', mimeType: 'text/csv', buffer })

  assert.equal(parsed.records.length, 6)
  assert.equal(parsed.records[1]?.sourceAmount, '941.4')
  assert.equal(parsed.records[1]?.amount, '793.5')
  assert.equal(parsed.records[1]?.sourceRecordKind, SourceRecordKind.NORMAL)
  assert.equal(parsed.records[2]?.sourceAmount, '57.8')
  assert.equal(parsed.records[2]?.amount, '0')
  assert.equal(parsed.records[2]?.status, ImportRecordStatus.IGNORED)
  assert.equal(parsed.records[3]?.sourceRecordKind, SourceRecordKind.REFUND)
  assert.equal(
    parsed.records.filter((record) => record.sourceTransactionId === 'JD-DEMO-004').length,
    2,
  )
})

test('微信 Parser 自动定位 XLSX 表头并按 UTC+08:00 解析时间', async () => {
  const parser = new WechatBillParser()
  const buffer = await createWechatFixture()
  const input = {
    fileName: '微信支付账单.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  }

  assert.equal(await parser.canParse(input), true)
  const parsed = await parser.parse(input)
  assert.equal(parsed.records.length, 4)
  assert.equal(parsed.records[0]?.sourceTransactionTime?.toISOString(), '2026-09-21T15:42:03.000Z')
  assert.equal(parsed.records[0]?.sourceAmount, '149')
  assert.equal(parsed.records[2]?.sourceRecordKind, SourceRecordKind.REFUND)
  assert.equal(parsed.records[3]?.reconcileStatus, ImportReconcileStatus.UNSUPPORTED)
})

test('Parser Registry 根据内容而非文件名识别平台', async () => {
  const registry = new BillParserRegistry(
    new AlipayBillParser(),
    new JdBillParser(),
    new WechatBillParser(),
  )
  const alipayBuffer = await readFile(fixturePath('alipay.csv'))
  const jdBuffer = await readFile(fixturePath('jd.csv'))
  const wechatBuffer = await createWechatFixture()

  assert.equal(
    (await registry.parse({ fileName: '账单一.csv', mimeType: 'text/csv', buffer: alipayBuffer }))
      ?.source,
    TransactionSource.ALIPAY,
  )
  assert.equal(
    (await registry.parse({ fileName: '账单二.csv', mimeType: 'text/csv', buffer: jdBuffer }))
      ?.source,
    TransactionSource.JD,
  )
  assert.equal(
    (
      await registry.parse({
        fileName: '账单三.xlsx',
        mimeType: 'application/octet-stream',
        buffer: wechatBuffer,
      })
    )?.source,
    TransactionSource.WECHAT,
  )
})
