import { BadRequestException, Injectable } from '@nestjs/common'

import {
  ImportRecordStatus,
  ImportReconcileStatus,
  SourceRecordKind,
  TransactionSource,
  TransactionType,
} from '../../generated/prisma/enums'
import type { BillParserInput, NormalizedImportRecord, ParsedBill } from '../imports.types'
import type { BillParser } from './bill-parser.interface'
import {
  buildRawData,
  cleanCell,
  createFingerprint,
  findHeaderRow,
  getRawValue,
  isEmptyRow,
  isKnownFooterRow,
  normalizeOptional,
  normalizePaymentMethod,
  parseCsvRows,
  parseDecimal,
  parseShanghaiDate,
} from './parser.utils'

const REQUIRED_HEADERS = [
  '交易时间',
  '交易分类',
  '交易对方',
  '商品说明',
  '收/支',
  '金额',
  '交易订单号',
] as const

const SUPPORTED_STATUSES = new Set(['交易成功', '交易关闭'])

@Injectable()
export class AlipayBillParser implements BillParser {
  async canParse(input: BillParserInput): Promise<boolean> {
    if (!input.fileName.toLowerCase().endsWith('.csv')) return false

    try {
      return findHeaderRow(parseCsvRows(input.buffer), REQUIRED_HEADERS) >= 0
    } catch (_error) {
      return false
    }
  }

  async parse(input: BillParserInput): Promise<ParsedBill> {
    const rows = parseCsvRows(input.buffer)
    const headerIndex = findHeaderRow(rows, REQUIRED_HEADERS)
    if (headerIndex < 0) throw new BadRequestException('支付宝账单表头无法识别')

    const headerRow = rows[headerIndex] || []
    const records = rows
      .slice(headerIndex + 1)
      .filter((row) => !isEmptyRow(row) && !isKnownFooterRow(row))
      .map((row) => this.normalizeRow(headerRow, row))

    return { source: TransactionSource.ALIPAY, records }
  }

  private readonly normalizeRow = (
    headerRow: readonly string[],
    row: readonly string[],
  ): NormalizedImportRecord => {
    const rawData = buildRawData(headerRow, row)
    const timeValue = getRawValue(rawData, '交易时间')
    const amountValue = getRawValue(rawData, '金额')
    const flowValue = getRawValue(rawData, '收/支')
    const statusValue = getRawValue(rawData, '交易状态')
    const merchant = normalizeOptional(getRawValue(rawData, '交易对方'))
    const description = normalizeOptional(getRawValue(rawData, '商品说明'))
    const sourceTransactionId = normalizeOptional(getRawValue(rawData, '交易订单号'))
    const sourceOrderId = normalizeOptional(getRawValue(rawData, '商家订单号'))
    const warnings: string[] = []

    const missingFields = [
      ['交易时间', timeValue],
      ['金额', amountValue],
      ['收/支', flowValue],
    ]
      .filter(([, value]) => !cleanCell(value))
      .map(([field]) => field)

    if (missingFields.length) {
      warnings.push(`支付宝记录缺少必要字段：${missingFields.join('、')}`)
      return this.createRecord({
        rawData,
        status: ImportRecordStatus.ERROR,
        warnings,
        merchant,
        description,
        sourceTransactionId,
        sourceOrderId,
      })
    }

    const sourceTransactionTime = parseShanghaiDate(timeValue)
    const sourceAmountValue = parseDecimal(amountValue)
    const sourceAmount = sourceAmountValue?.toFixed() || null
    let type: TransactionType | null = null
    let status: ImportRecordStatus = ImportRecordStatus.READY
    let reconcileStatus: ImportReconcileStatus | null = null

    if (flowValue === '收入') type = TransactionType.INCOME
    else if (flowValue === '支出') type = TransactionType.EXPENSE
    else if (flowValue === '不计收支') status = ImportRecordStatus.IGNORED
    else warnings.push(`支付宝发现未知收支类型：${flowValue}`)

    if (!sourceTransactionTime) warnings.push(`支付宝发现未知交易时间格式：${timeValue}`)
    if (!sourceAmountValue) warnings.push(`支付宝发现未知金额格式：${amountValue}`)

    const refundText = [amountValue, statusValue, description || ''].join(' ')
    if (/退款/.test(refundText)) {
      warnings.push('支付宝发现尚未支持的退款格式')
    }

    if (statusValue && !SUPPORTED_STATUSES.has(statusValue) && !/退款/.test(statusValue)) {
      warnings.push(`支付宝发现未知交易状态：${statusValue}`)
    }

    if (warnings.length) {
      reconcileStatus = ImportReconcileStatus.UNSUPPORTED
      status = ImportRecordStatus.READY
    }

    const fingerprint = createFingerprint({
      source: TransactionSource.ALIPAY,
      sourceTransactionTime,
      sourceAmount,
      merchant,
      sourceTransactionId,
      sourceOrderId,
    })

    return {
      source: TransactionSource.ALIPAY,
      transactionTime: sourceTransactionTime,
      type,
      amount: sourceAmount,
      merchant,
      description,
      remark: normalizeOptional(getRawValue(rawData, '备注')),
      sourceTransactionId,
      sourceOrderId,
      sourceTransactionTime,
      sourceAmount,
      sourceStatus: normalizeOptional(statusValue),
      sourceCategory: normalizeOptional(getRawValue(rawData, '交易分类')),
      paymentMethod: normalizePaymentMethod(getRawValue(rawData, '收/付款方式')),
      sourceRecordKind: SourceRecordKind.NORMAL,
      fingerprint,
      status,
      reconcileStatus,
      normalizationReason: null,
      parserWarnings: warnings,
      rawData,
    }
  }

  private readonly createRecord = (input: {
    rawData: NormalizedImportRecord['rawData']
    status: ImportRecordStatus
    warnings: string[]
    merchant: string | null
    description: string | null
    sourceTransactionId: string | null
    sourceOrderId: string | null
  }): NormalizedImportRecord => ({
    source: TransactionSource.ALIPAY,
    transactionTime: null,
    type: null,
    amount: null,
    merchant: input.merchant,
    description: input.description,
    remark: normalizeOptional(getRawValue(input.rawData, '备注')),
    sourceTransactionId: input.sourceTransactionId,
    sourceOrderId: input.sourceOrderId,
    sourceTransactionTime: null,
    sourceAmount: null,
    sourceStatus: normalizeOptional(getRawValue(input.rawData, '交易状态')),
    sourceCategory: normalizeOptional(getRawValue(input.rawData, '交易分类')),
    paymentMethod: normalizePaymentMethod(getRawValue(input.rawData, '收/付款方式')),
    sourceRecordKind: null,
    fingerprint: null,
    status: input.status,
    reconcileStatus: null,
    normalizationReason: null,
    parserWarnings: input.warnings,
    rawData: input.rawData,
  })
}
