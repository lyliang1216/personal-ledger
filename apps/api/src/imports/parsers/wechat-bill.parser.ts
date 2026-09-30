import { BadRequestException, Injectable } from '@nestjs/common'
import * as ExcelJS from 'exceljs'

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
  parseDecimal,
  parseShanghaiDate,
} from './parser.utils'

const REQUIRED_HEADERS = [
  '交易时间',
  '交易类型',
  '交易对方',
  '商品',
  '收/支',
  '金额(元)',
  '支付方式',
  '当前状态',
  '交易单号',
] as const

const SUPPORTED_STATUSES = new Set([
  '支付成功',
  '已支付',
  '已收钱',
  '对方已收钱',
  '已存入零钱',
  '转账成功',
  '退款成功',
  '已退款',
  '已全额退款',
])

@Injectable()
export class WechatBillParser implements BillParser {
  async canParse(input: BillParserInput): Promise<boolean> {
    if (!input.fileName.toLowerCase().endsWith('.xlsx')) return false

    try {
      const rows = await this.readRows(input.buffer)
      return findHeaderRow(rows, REQUIRED_HEADERS) >= 0
    } catch (_error) {
      return false
    }
  }

  async parse(input: BillParserInput): Promise<ParsedBill> {
    const rows = await this.readRows(input.buffer)
    const headerIndex = findHeaderRow(rows, REQUIRED_HEADERS)
    if (headerIndex < 0) throw new BadRequestException('微信账单表头无法识别')

    const headerRow = rows[headerIndex] || []
    const records = rows
      .slice(headerIndex + 1)
      .filter((row) => !isEmptyRow(row) && !isKnownFooterRow(row))
      .map((row) => this.normalizeRow(headerRow, row))

    return { source: TransactionSource.WECHAT, records }
  }

  private readonly readRows = async (buffer: Buffer): Promise<string[][]> => {
    const workbook = new ExcelJS.Workbook()
    const workbookBuffer = Uint8Array.from(buffer).buffer as unknown as Parameters<
      typeof workbook.xlsx.load
    >[0]
    await workbook.xlsx.load(workbookBuffer)

    for (const worksheet of workbook.worksheets) {
      const rows: string[][] = []
      worksheet.eachRow({ includeEmpty: true }, (row) => {
        const values: string[] = []
        for (let index = 1; index <= row.cellCount; index += 1) {
          values.push(row.getCell(index).text)
        }
        rows.push(values)
      })

      if (findHeaderRow(rows, REQUIRED_HEADERS) >= 0) return rows
    }

    return []
  }

  private readonly normalizeRow = (
    headerRow: readonly string[],
    row: readonly string[],
  ): NormalizedImportRecord => {
    const rawData = buildRawData(headerRow, row)
    const timeValue = getRawValue(rawData, '交易时间')
    const amountValue = getRawValue(rawData, '金额(元)')
    const flowValue = getRawValue(rawData, '收/支')
    const statusValue = getRawValue(rawData, '当前状态')
    const transactionCategory = getRawValue(rawData, '交易类型')
    const merchant = normalizeOptional(getRawValue(rawData, '交易对方'))
    const description = normalizeOptional(getRawValue(rawData, '商品'))
    const sourceTransactionId = normalizeOptional(getRawValue(rawData, '交易单号'))
    const sourceOrderId = normalizeOptional(getRawValue(rawData, '商户单号'))
    const warnings: string[] = []

    const missingFields = [
      ['交易时间', timeValue],
      ['金额(元)', amountValue],
      ['收/支', flowValue],
    ]
      .filter(([, value]) => !cleanCell(value))
      .map(([field]) => field)

    if (missingFields.length) {
      warnings.push(`微信记录缺少必要字段：${missingFields.join('、')}`)
      return this.createErrorRecord(rawData, warnings)
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
    else warnings.push(`微信发现未知收支类型：${flowValue}`)

    if (!sourceTransactionTime) warnings.push(`微信发现未知交易时间格式：${timeValue}`)
    if (!sourceAmountValue) warnings.push(`微信发现未知金额格式：${amountValue}`)
    if (statusValue && !SUPPORTED_STATUSES.has(statusValue)) {
      warnings.push(`微信发现未知交易状态：${statusValue}`)
    }

    const refundText = [transactionCategory, description || '', statusValue].join(' ')
    const sourceRecordKind = /退款/.test(refundText)
      ? SourceRecordKind.REFUND
      : SourceRecordKind.NORMAL

    if (warnings.length) {
      reconcileStatus = ImportReconcileStatus.UNSUPPORTED
      status = ImportRecordStatus.READY
    }

    const fingerprint = createFingerprint({
      source: TransactionSource.WECHAT,
      sourceTransactionTime,
      sourceAmount,
      merchant,
      sourceTransactionId,
      sourceOrderId,
    })

    return {
      source: TransactionSource.WECHAT,
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
      sourceCategory: normalizeOptional(transactionCategory),
      paymentMethod: normalizePaymentMethod(getRawValue(rawData, '支付方式')),
      sourceRecordKind,
      fingerprint,
      status,
      reconcileStatus,
      normalizationReason: null,
      parserWarnings: warnings,
      rawData,
    }
  }

  private readonly createErrorRecord = (
    rawData: NormalizedImportRecord['rawData'],
    warnings: string[],
  ): NormalizedImportRecord => ({
    source: TransactionSource.WECHAT,
    transactionTime: null,
    type: null,
    amount: null,
    merchant: normalizeOptional(getRawValue(rawData, '交易对方')),
    description: normalizeOptional(getRawValue(rawData, '商品')),
    remark: normalizeOptional(getRawValue(rawData, '备注')),
    sourceTransactionId: normalizeOptional(getRawValue(rawData, '交易单号')),
    sourceOrderId: normalizeOptional(getRawValue(rawData, '商户单号')),
    sourceTransactionTime: null,
    sourceAmount: null,
    sourceStatus: normalizeOptional(getRawValue(rawData, '当前状态')),
    sourceCategory: normalizeOptional(getRawValue(rawData, '交易类型')),
    paymentMethod: normalizePaymentMethod(getRawValue(rawData, '支付方式')),
    sourceRecordKind: null,
    fingerprint: null,
    status: ImportRecordStatus.ERROR,
    reconcileStatus: null,
    normalizationReason: null,
    parserWarnings: warnings,
    rawData,
  })
}
