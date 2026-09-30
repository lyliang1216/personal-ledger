import { BadRequestException, Injectable } from '@nestjs/common'

import { Prisma } from '../../generated/prisma/client'
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
  '商户名称',
  '交易说明',
  '金额',
  '收/付款方式',
  '交易状态',
  '交易分类',
] as const

const PARTIAL_REFUND_PATTERN = /^(.+?)\(已退款(.+?)\)$/
const FULL_REFUND_PATTERN = /^(.+?)\(已全额退款\)$/
const SUPPORTED_STATUSES = new Set(['交易成功', '交易完成', '退款成功', '已退款', '已全额退款'])

@Injectable()
export class JdBillParser implements BillParser {
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
    if (headerIndex < 0) throw new BadRequestException('京东账单表头无法识别')

    const headerRow = rows[headerIndex] || []
    const records = rows
      .slice(headerIndex + 1)
      .filter((row) => !isEmptyRow(row) && !isKnownFooterRow(row))
      .map((row) => this.normalizeRow(headerRow, row))

    return { source: TransactionSource.JD, records }
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
    const description = normalizeOptional(getRawValue(rawData, '交易说明'))
    const merchant = normalizeOptional(getRawValue(rawData, '商户名称'))
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
      warnings.push(`京东记录缺少必要字段：${missingFields.join('、')}`)
      return this.createErrorRecord(rawData, warnings)
    }

    const sourceTransactionTime = parseShanghaiDate(timeValue)
    const amountResult = this.parseJdAmount(amountValue)
    let type: TransactionType | null = null
    let status: ImportRecordStatus = ImportRecordStatus.READY
    let reconcileStatus: ImportReconcileStatus | null = null

    if (flowValue === '收入') type = TransactionType.INCOME
    else if (flowValue === '支出') type = TransactionType.EXPENSE
    else if (flowValue === '不计收支') {
      status = ImportRecordStatus.IGNORED
      if (amountResult?.isFullRefund) type = TransactionType.EXPENSE
    } else warnings.push(`京东发现未知收支类型：${flowValue}`)

    if (!sourceTransactionTime) warnings.push(`京东发现未知交易时间格式：${timeValue}`)
    if (!amountResult) warnings.push(`京东发现未知金额格式：${amountValue}`)
    if (statusValue && !SUPPORTED_STATUSES.has(statusValue)) {
      warnings.push(`京东发现未知交易状态：${statusValue}`)
    }

    const isRefundRecord =
      /退款/.test([description || '', statusValue].join(' ')) &&
      !amountResult?.isPartialRefund &&
      !amountResult?.isFullRefund
    const sourceRecordKind = isRefundRecord ? SourceRecordKind.REFUND : SourceRecordKind.NORMAL

    if (warnings.length) {
      reconcileStatus = ImportReconcileStatus.UNSUPPORTED
      status = ImportRecordStatus.READY
    } else if (
      amountResult?.isFullRefund ||
      (sourceRecordKind === SourceRecordKind.REFUND && flowValue === '不计收支')
    ) {
      status = ImportRecordStatus.IGNORED
    }

    const sourceAmount = amountResult?.sourceAmount.toFixed() || null
    const amount = amountResult?.amount.toFixed() || null
    const fingerprint = createFingerprint({
      source: TransactionSource.JD,
      sourceTransactionTime,
      sourceAmount,
      merchant,
      sourceTransactionId,
      sourceOrderId,
    })

    return {
      source: TransactionSource.JD,
      transactionTime: sourceTransactionTime,
      type,
      amount,
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
      sourceRecordKind,
      fingerprint,
      status,
      reconcileStatus,
      normalizationReason: amountResult?.reason || null,
      parserWarnings: warnings,
      rawData,
    }
  }

  private readonly parseJdAmount = (
    value: string,
  ): {
    sourceAmount: Prisma.Decimal
    amount: Prisma.Decimal
    isPartialRefund: boolean
    isFullRefund: boolean
    reason: string | null
  } | null => {
    const normalized = cleanCell(value)
    const partialMatch = PARTIAL_REFUND_PATTERN.exec(normalized)
    if (partialMatch) {
      const sourceAmount = parseDecimal(partialMatch[1] || '')
      const refundAmount = parseDecimal(partialMatch[2] || '')
      if (!sourceAmount || !refundAmount || refundAmount.greaterThan(sourceAmount)) return null

      const amount = sourceAmount.minus(refundAmount)
      return {
        sourceAmount,
        amount,
        isPartialRefund: true,
        isFullRefund: false,
        reason: `原金额${sourceAmount.toFixed()}，已退款${refundAmount.toFixed()}，实际统计金额${amount.toFixed()}`,
      }
    }

    const fullMatch = FULL_REFUND_PATTERN.exec(normalized)
    if (fullMatch) {
      const sourceAmount = parseDecimal(fullMatch[1] || '')
      if (!sourceAmount) return null

      return {
        sourceAmount,
        amount: new Prisma.Decimal(0),
        isPartialRefund: false,
        isFullRefund: true,
        reason: `原金额${sourceAmount.toFixed()}，已全额退款`,
      }
    }

    const sourceAmount = parseDecimal(normalized)
    if (!sourceAmount) return null

    return {
      sourceAmount,
      amount: sourceAmount,
      isPartialRefund: false,
      isFullRefund: false,
      reason: null,
    }
  }

  private readonly createErrorRecord = (
    rawData: NormalizedImportRecord['rawData'],
    warnings: string[],
  ): NormalizedImportRecord => ({
    source: TransactionSource.JD,
    transactionTime: null,
    type: null,
    amount: null,
    merchant: normalizeOptional(getRawValue(rawData, '商户名称')),
    description: normalizeOptional(getRawValue(rawData, '交易说明')),
    remark: normalizeOptional(getRawValue(rawData, '备注')),
    sourceTransactionId: normalizeOptional(getRawValue(rawData, '交易订单号')),
    sourceOrderId: normalizeOptional(getRawValue(rawData, '商家订单号')),
    sourceTransactionTime: null,
    sourceAmount: null,
    sourceStatus: normalizeOptional(getRawValue(rawData, '交易状态')),
    sourceCategory: normalizeOptional(getRawValue(rawData, '交易分类')),
    paymentMethod: normalizePaymentMethod(getRawValue(rawData, '收/付款方式')),
    sourceRecordKind: null,
    fingerprint: null,
    status: ImportRecordStatus.ERROR,
    reconcileStatus: null,
    normalizationReason: null,
    parserWarnings: warnings,
    rawData,
  })
}
