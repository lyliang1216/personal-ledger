import { request } from './request'

export type StatisticsScope = 'DEFAULT' | 'ALL'
export type StatisticsType = 'EXPENSE' | 'INCOME'

export interface StatisticsDateRangeQuery {
  startDate: string
  endDate: string
}

export interface StatisticsRangeQuery extends StatisticsDateRangeQuery {
  scope?: StatisticsScope
  ledgerId?: string
}

export interface CategoryStatisticsQuery extends StatisticsRangeQuery {
  type?: StatisticsType
  level?: 1 | 2
}

export interface CalendarStatisticsQuery {
  month: string
  scope?: StatisticsScope
  ledgerId?: string
}

export interface TopTransactionsQuery extends StatisticsRangeQuery {
  limit?: number
}

export interface StatisticsOverview {
  expenseAmount: string
  incomeAmount: string
  refundAmount: string
  netCashFlow: string
  transactionCount: number
  expenseCount: number
  incomeCount: number
  refundCount: number
}

export interface StatisticsTrendItem {
  expenseAmount: string
  incomeAmount: string
  refundAmount: string
  count: number
}

export interface DailyStatisticsItem extends StatisticsTrendItem {
  date: string
}

export interface MonthlyStatisticsItem extends StatisticsTrendItem {
  month: string
}

export interface CategoryStatisticsItem {
  categoryId: string | null
  categoryName: string
  amount: string
  count: number
  percentage: string
}

export interface TagStatisticsItem {
  tagId: string
  tagName: string
  amount: string
  count: number
}

export interface AccountStatisticsItem {
  accountId: string | null
  accountName: string
  amount: string
  count: number
}

export interface LedgerStatisticsItem {
  ledgerId: string
  ledgerName: string
  isDefault: boolean
  expenseAmount: string
  incomeAmount: string
  refundAmount: string
  count: number
}

export interface StatisticsRelation {
  id: string
  name: string
}

export interface TopTransactionItem {
  id: string
  transactionTime: string
  amount: string
  merchant: string | null
  description: string | null
  remark: string | null
  category: StatisticsRelation | null
  ledger: StatisticsRelation
}

const buildQueryString = (query: object): string => {
  const searchParams = new URLSearchParams()

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') searchParams.set(key, String(value))
  })

  return searchParams.toString()
}

export const getStatisticsOverview = (query: StatisticsRangeQuery): Promise<StatisticsOverview> => {
  return request<StatisticsOverview>(`/statistics/overview?${buildQueryString(query)}`)
}

export const getDailyStatistics = (query: StatisticsRangeQuery): Promise<DailyStatisticsItem[]> => {
  return request<DailyStatisticsItem[]>(`/statistics/daily?${buildQueryString(query)}`)
}

export const getMonthlyStatistics = (
  query: StatisticsRangeQuery,
): Promise<MonthlyStatisticsItem[]> => {
  return request<MonthlyStatisticsItem[]>(`/statistics/monthly?${buildQueryString(query)}`)
}

export const getCategoryStatistics = (
  query: CategoryStatisticsQuery,
): Promise<CategoryStatisticsItem[]> => {
  return request<CategoryStatisticsItem[]>(`/statistics/categories?${buildQueryString(query)}`)
}

export const getTagStatistics = (query: StatisticsRangeQuery): Promise<TagStatisticsItem[]> => {
  return request<TagStatisticsItem[]>(`/statistics/tags?${buildQueryString(query)}`)
}

export const getAccountStatistics = (
  query: StatisticsRangeQuery,
): Promise<AccountStatisticsItem[]> => {
  return request<AccountStatisticsItem[]>(`/statistics/accounts?${buildQueryString(query)}`)
}

export const getLedgerStatistics = (
  query: StatisticsDateRangeQuery,
): Promise<LedgerStatisticsItem[]> => {
  return request<LedgerStatisticsItem[]>(`/statistics/ledgers?${buildQueryString(query)}`)
}

export const getCalendarStatistics = (
  query: CalendarStatisticsQuery,
): Promise<DailyStatisticsItem[]> => {
  return request<DailyStatisticsItem[]>(`/statistics/calendar?${buildQueryString(query)}`)
}

export const getTopTransactions = (query: TopTransactionsQuery): Promise<TopTransactionItem[]> => {
  return request<TopTransactionItem[]>(`/statistics/top-transactions?${buildQueryString(query)}`)
}
