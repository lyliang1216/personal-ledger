import { createHash } from 'node:crypto'

import { BadRequestException } from '@nestjs/common'
import { parse } from 'csv-parse/sync'
import * as iconv from 'iconv-lite'

import { Prisma } from '../../generated/prisma/client'
import type { TransactionSource } from '../../generated/prisma/enums'

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
const SHANGHAI_DATE_PATTERN =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/

export const cleanCell = (value: unknown): string => {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/^[\s\t]+|[\s\t]+$/g, '')
}

export const normalizeOptional = (value: unknown): string | null => {
  const normalized = cleanCell(value)
  return normalized || null
}

export const normalizeHeader = (value: unknown): string => {
  return cleanCell(value).replace(/\s+/g, '')
}

export const decodeCsvBuffer = (buffer: Buffer): string => {
  if (!buffer.length) return ''

  if (buffer.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)) {
    return iconv.decode(buffer.subarray(UTF8_BOM.length), 'utf8')
  }

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return iconv.decode(buffer, 'utf8')
  } catch (_error) {
    return iconv.decode(buffer, 'gb18030')
  }
}

export const parseCsvRows = (buffer: Buffer): string[][] => {
  const content = decodeCsvBuffer(buffer)
  if (!cleanCell(content)) return []

  const rows = parse(content, {
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: false,
  }) as unknown[][]

  return rows.map((row) => row.map((cell) => String(cell ?? '')))
}

export const findHeaderRow = (
  rows: string[][],
  requiredHeaders: readonly string[],
  scanLimit = 80,
): number => {
  const normalizedRequired = requiredHeaders.map(normalizeHeader)
  const lastIndex = Math.min(rows.length, scanLimit)

  for (let index = 0; index < lastIndex; index += 1) {
    const normalizedHeaders = new Set((rows[index] || []).map(normalizeHeader).filter(Boolean))
    if (normalizedRequired.every((header) => normalizedHeaders.has(header))) return index
  }

  return -1
}

export const buildRawData = (
  headerRow: readonly string[],
  dataRow: readonly string[],
): Prisma.InputJsonObject => {
  return headerRow.reduce<Record<string, Prisma.InputJsonValue>>((result, header, index) => {
    const key = cleanCell(header) || `未命名字段${index + 1}`
    result[key] = dataRow[index] ?? ''
    return result
  }, {})
}

export const getRawValue = (rawData: Prisma.InputJsonObject, header: string): string => {
  const target = normalizeHeader(header)
  const entry = Object.entries(rawData).find(([key]) => normalizeHeader(key) === target)
  return cleanCell(entry?.[1])
}

export const isEmptyRow = (row: readonly string[]): boolean => row.every((cell) => !cleanCell(cell))

export const isKnownFooterRow = (row: readonly string[]): boolean => {
  const content = row.map(cleanCell).filter(Boolean).join('')
  if (!content) return true

  return /^(-{3,}|={3,}|共\d+笔|账单统计|导出时间|记录数)/.test(content)
}

export const parseShanghaiDate = (value: string): Date | null => {
  const match = SHANGHAI_DATE_PATTERN.exec(cleanCell(value))
  if (!match) return null

  const [, year, month, day, hour, minute, second = '00'] = match
  const isoValue = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}T${hour!.padStart(2, '0')}:${minute}:${second}+08:00`
  const date = new Date(isoValue)

  return Number.isNaN(date.getTime()) ? null : date
}

export const parseDecimal = (value: string): Prisma.Decimal | null => {
  const normalized = cleanCell(value)
    .replace(/[¥￥,，\s]/g, '')
    .replace(/^\+/, '')

  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) return null

  try {
    const amount = new Prisma.Decimal(normalized)
    return amount.isNegative() ? null : amount
  } catch (_error) {
    return null
  }
}

export const normalizePaymentMethod = (value: string): string | null => {
  const original = cleanCell(value)
  if (!original) return null

  const parts = original.split('&').map(cleanCell).filter(Boolean)
  if (parts.length <= 1) return original

  const discountPattern = /(红包|优惠|立减|优惠券|碰一下立减|立减金)/
  if (parts.slice(1).every((part) => discountPattern.test(part))) return parts[0] || original

  return original
}

export const createFingerprint = (input: {
  source: TransactionSource
  sourceTransactionTime: Date | null
  sourceAmount: string | null
  merchant: string | null
  sourceTransactionId: string | null
  sourceOrderId: string | null
}): string | null => {
  if (!input.sourceTransactionTime || !input.sourceAmount) return null

  const identity = [
    input.source,
    input.sourceTransactionTime.toISOString(),
    new Prisma.Decimal(input.sourceAmount).toFixed(),
    cleanCell(input.merchant).toLowerCase(),
    cleanCell(input.sourceTransactionId),
    cleanCell(input.sourceOrderId),
  ].join('\u001f')

  return createHash('sha256').update(identity).digest('hex')
}

export const ensureRecordLimit = (recordCount: number, maximum: number): void => {
  if (recordCount > maximum) {
    throw new BadRequestException(`账单记录超过 ${maximum} 条限制`)
  }
}
