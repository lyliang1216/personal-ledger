import type { TransactionType } from './category'
import { request } from './request'

export type TransactionSource = 'MANUAL' | 'ALIPAY' | 'WECHAT' | 'JD' | 'TAOBAO' | 'OTHER'
export type BatchTagMode = 'ADD' | 'REMOVE'

export interface TransactionRelation {
  id: string
  name: string
}

export interface TransactionSourceSummary {
  id: string
  source: TransactionSource
  sourceTransactionId: string | null
  sourceOrderId: string | null
}

export interface TransactionSourceDetail extends TransactionSourceSummary {
  transactionId: string
  userId: string
  sourceTransactionTime: string
  sourceAmount: string
  sourceStatus: string | null
  sourceCategory: string | null
  paymentMethod: string | null
  fingerprint: string | null
  rawData: unknown | null
  createdAt: string
  updatedAt: string
}

export interface TransactionItem {
  id: string
  type: TransactionType
  amount: string
  transactionTime: string
  merchant: string | null
  description: string | null
  remark: string | null
  ledgerId: string
  categoryId: string | null
  accountId: string | null
  createdAt: string
  updatedAt: string
  ledger: TransactionRelation
  category: TransactionRelation | null
  account: TransactionRelation | null
  tags: TransactionRelation[]
  sources: TransactionSourceSummary[]
}

export interface TransactionDetail extends TransactionItem {
  sources: TransactionSourceDetail[]
}

export interface TransactionQuery {
  startDate?: string
  endDate?: string
  type?: TransactionType
  ledgerId?: string
  categoryId?: string
  accountId?: string
  source?: TransactionSource
  tagId?: string
  keyword?: string
  page: number
  pageSize: number
}

export interface TransactionListResponse {
  items: TransactionItem[]
  total: number
  page: number
  pageSize: number
}

export interface TransactionWriteParams {
  type: TransactionType
  amount: string
  transactionTime: string
  merchant?: string
  description?: string
  remark?: string
  ledgerId?: string
  categoryId?: string | null
  accountId?: string | null
  tagIds?: string[]
}

export type UpdateTransactionParams = Partial<TransactionWriteParams>

export interface BatchResult {
  count: number
}

export const transactionSourceLabels: Record<TransactionSource, string> = {
  MANUAL: '手工',
  ALIPAY: '支付宝',
  WECHAT: '微信',
  JD: '京东',
  TAOBAO: '淘宝',
  OTHER: '其他',
}

export const transactionSourceOptions = Object.entries(transactionSourceLabels).map(
  ([value, label]) => ({ value: value as TransactionSource, label }),
)

const buildQueryString = (query: TransactionQuery): string => {
  const searchParams = new URLSearchParams()

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value))
    }
  })

  return searchParams.toString()
}

export const getTransactionsApi = (query: TransactionQuery): Promise<TransactionListResponse> => {
  return request<TransactionListResponse>(`/transactions?${buildQueryString(query)}`)
}

export const getTransactionApi = (id: string): Promise<TransactionDetail> => {
  return request<TransactionDetail>(`/transactions/${id}`)
}

export const createTransactionApi = (
  params: TransactionWriteParams,
): Promise<TransactionDetail> => {
  return request<TransactionDetail>('/transactions', {
    method: 'POST',
    body: params,
  })
}

export const updateTransactionApi = (
  id: string,
  params: UpdateTransactionParams,
): Promise<TransactionDetail> => {
  return request<TransactionDetail>(`/transactions/${id}`, {
    method: 'PATCH',
    body: params,
  })
}

export const deleteTransactionApi = (id: string): Promise<void> => {
  return request<void>(`/transactions/${id}`, { method: 'DELETE' })
}

export const batchDeleteTransactionsApi = (ids: string[]): Promise<BatchResult> => {
  return request<BatchResult>('/transactions/batch-delete', {
    method: 'POST',
    body: { ids },
  })
}

export const batchUpdateCategoryApi = (ids: string[], categoryId: string): Promise<BatchResult> => {
  return request<BatchResult>('/transactions/batch-category', {
    method: 'POST',
    body: { ids, categoryId },
  })
}

export const batchUpdateTagsApi = (
  ids: string[],
  tagIds: string[],
  mode: BatchTagMode,
): Promise<BatchResult> => {
  return request<BatchResult>('/transactions/batch-tags', {
    method: 'POST',
    body: { ids, tagIds, mode },
  })
}

export const batchUpdateLedgerApi = (ids: string[], ledgerId: string): Promise<BatchResult> => {
  return request<BatchResult>('/transactions/batch-ledger', {
    method: 'POST',
    body: { ids, ledgerId },
  })
}
