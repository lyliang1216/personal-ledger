import type { TransactionType } from './category'
import { request } from './request'
import type { TransactionSource } from './transaction'

export type ImportTaskStatus =
  'PENDING' | 'PARSING' | 'PREVIEW' | 'IMPORTING' | 'COMPLETED' | 'FAILED'
export type ImportRecordStatus =
  'PENDING' | 'READY' | 'DUPLICATE' | 'IGNORED' | 'IMPORTED' | 'ERROR'
export type ImportReconcileStatus =
  'NEW' | 'UNCHANGED' | 'CHANGED' | 'AUTO_MATCH' | 'POSSIBLE_MATCH' | 'UNSUPPORTED'
export type ImportRecordDecision = 'PENDING' | 'CREATE_NEW' | 'LINK_EXISTING' | 'APPLY_CHANGE'
export type SourceRecordKind = 'NORMAL' | 'REFUND'
export type ImportTagBatchMode = 'ADD' | 'REMOVE'

export interface ImportRelation {
  id: string
  name: string
}

export interface ImportTask {
  id: string
  source: TransactionSource
  fileName: string
  status: ImportTaskStatus
  errorMessage: string | null
  totalCount: number
  validCount: number
  duplicateCount: number
  ignoredCount: number
  importedCount: number
  createdAt: string
  updatedAt: string
  statusCounts: Partial<Record<ImportRecordStatus, number>>
  reconcileCounts: Partial<Record<ImportReconcileStatus | 'UNSET', number>>
}

export interface ImportCandidateSource {
  id: string
  source: TransactionSource
  sourceRecordKind?: SourceRecordKind
  sourceAmount?: string
  sourceTransactionTime?: string
  sourceStatus?: string | null
  sourceCategory?: string | null
  paymentMethod?: string | null
}

export interface ImportCandidateTransaction {
  id: string
  type: TransactionType
  amount: string
  transactionTime: string
  merchant: string | null
  description?: string | null
  remark?: string | null
  sources?: ImportCandidateSource[]
}

export interface ImportRecord {
  id: string
  importTaskId: string
  source: TransactionSource
  sourceTransactionId: string | null
  sourceOrderId: string | null
  sourceTransactionTime: string | null
  sourceAmount: string | null
  sourceStatus: string | null
  sourceCategory: string | null
  paymentMethod: string | null
  sourceRecordKind: SourceRecordKind | null
  transactionTime: string | null
  amount: string | null
  type: TransactionType | null
  merchant: string | null
  description: string | null
  remark: string | null
  categoryId: string | null
  ledgerId: string | null
  accountId: string | null
  fingerprint: string | null
  rawData: unknown
  status: ImportRecordStatus
  reconcileStatus: ImportReconcileStatus | null
  decision: ImportRecordDecision
  candidateTransactionId: string | null
  candidateSourceRecordId: string | null
  reconcileReason: string | null
  changeReason: string | null
  parserWarnings: string[]
  ledger: ImportRelation | null
  category: ImportRelation | null
  account: ImportRelation | null
  tags: ImportRelation[]
  candidateTransaction: ImportCandidateTransaction | null
  candidateSourceRecord: ImportCandidateSource | null
  createdAt: string
  updatedAt: string
}

export interface ImportTaskQuery {
  status?: ImportTaskStatus
  source?: TransactionSource
  page: number
  pageSize: number
}

export interface ImportRecordQuery {
  status?: ImportRecordStatus
  reconcileStatus?: ImportReconcileStatus
  keyword?: string
  categoryId?: string
  tagId?: string
  ledgerId?: string
  accountId?: string
  page: number
  pageSize: number
}

export interface ImportTaskListResponse {
  items: ImportTask[]
  total: number
  page: number
  pageSize: number
}

export interface ImportRecordListResponse {
  items: ImportRecord[]
  total: number
  page: number
  pageSize: number
}

export interface UpdateImportRecordParams {
  type?: TransactionType
  amount?: string
  transactionTime?: string
  merchant?: string
  description?: string
  remark?: string
  categoryId?: string | null
  ledgerId?: string | null
  accountId?: string | null
  tagIds?: string[]
}

export interface ImportConfirmResult {
  importTaskId: string
  created: number
  linked: number
  updated: number
  unchanged: number
  ignored: number
}

export interface BatchResult {
  count: number
  restored?: number
  errors?: number
}

const buildQueryString = <Query extends object>(query: Query): string => {
  const searchParams = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') searchParams.set(key, String(value))
  })
  return searchParams.toString()
}

export const uploadImportApi = (file: File): Promise<ImportTask> => {
  const formData = new FormData()
  formData.append('file', file)
  return request<ImportTask>('/imports/upload', { method: 'POST', body: formData })
}

export const getImportTasksApi = (query: ImportTaskQuery): Promise<ImportTaskListResponse> =>
  request<ImportTaskListResponse>(`/imports?${buildQueryString(query)}`)

export const getImportTaskApi = (id: string): Promise<ImportTask> =>
  request<ImportTask>(`/imports/${id}`)

export const getImportRecordsApi = (
  importTaskId: string,
  query: ImportRecordQuery,
): Promise<ImportRecordListResponse> =>
  request<ImportRecordListResponse>(`/imports/${importTaskId}/records?${buildQueryString(query)}`)

export const getImportRecordApi = (id: string): Promise<ImportRecord> =>
  request<ImportRecord>(`/import-records/${id}`)

export const updateImportRecordApi = (
  id: string,
  params: UpdateImportRecordParams,
): Promise<ImportRecord> =>
  request<ImportRecord>(`/import-records/${id}`, { method: 'PATCH', body: params })

export const updateImportDecisionApi = (
  id: string,
  decision: ImportRecordDecision,
  candidateTransactionId?: string,
  candidateSourceRecordId?: string,
): Promise<ImportRecord> =>
  request<ImportRecord>(`/import-records/${id}/decision`, {
    method: 'PATCH',
    body: { decision, candidateTransactionId, candidateSourceRecordId },
  })

export const getImportCandidatesApi = (id: string): Promise<ImportCandidateTransaction[]> =>
  request<ImportCandidateTransaction[]>(`/import-records/${id}/candidates`)

export const ignoreImportRecordApi = (id: string): Promise<BatchResult> =>
  request<BatchResult>(`/import-records/${id}/ignore`, { method: 'POST' })

export const restoreImportRecordApi = (id: string): Promise<BatchResult> =>
  request<BatchResult>(`/import-records/${id}/restore`, { method: 'POST' })

export const batchIgnoreImportRecordsApi = (ids: string[]): Promise<BatchResult> =>
  request<BatchResult>('/import-records/batch-ignore', { method: 'POST', body: { ids } })

export const batchRestoreImportRecordsApi = (ids: string[]): Promise<BatchResult> =>
  request<BatchResult>('/import-records/batch-restore', { method: 'POST', body: { ids } })

export const batchUpdateImportCategoryApi = (
  ids: string[],
  categoryId: string,
): Promise<BatchResult> =>
  request<BatchResult>('/import-records/batch-category', {
    method: 'POST',
    body: { ids, categoryId },
  })

export const batchUpdateImportTagsApi = (
  ids: string[],
  tagIds: string[],
  mode: ImportTagBatchMode,
): Promise<BatchResult> =>
  request<BatchResult>('/import-records/batch-tags', {
    method: 'POST',
    body: { ids, tagIds, mode },
  })

export const batchUpdateImportLedgerApi = (ids: string[], ledgerId: string): Promise<BatchResult> =>
  request<BatchResult>('/import-records/batch-ledger', {
    method: 'POST',
    body: { ids, ledgerId },
  })

export const batchUpdateImportAccountApi = (
  ids: string[],
  accountId: string,
): Promise<BatchResult> =>
  request<BatchResult>('/import-records/batch-account', {
    method: 'POST',
    body: { ids, accountId },
  })

export const confirmImportTaskApi = (id: string): Promise<ImportConfirmResult> =>
  request<ImportConfirmResult>(`/imports/${id}/confirm`, { method: 'POST' })
