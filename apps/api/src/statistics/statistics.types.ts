/**
 * 统计数量口径：
 * - transactionCount：范围内逻辑 Transaction 总数，来源记录数量不影响计数。
 * - expenseCount：EXPENSE Transaction 数量，amount 为 0 的全额退款历史消费仍计数。
 * - incomeCount：普通 INCOME Transaction 数量，不包含独立退款收入。
 * - refundCount：独立退款收入 Transaction 数量。
 */
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

export interface DimensionStatisticsItem {
  amount: string
  count: number
}

/** 标签是可重复归属维度，同一 Transaction 可将完整金额计入多个标签。 */
export interface TagStatisticsItem extends DimensionStatisticsItem {
  tagId: string
  tagName: string
}
