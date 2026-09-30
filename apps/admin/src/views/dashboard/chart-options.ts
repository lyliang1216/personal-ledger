import type { EChartsCoreOption, TooltipComponentFormatterCallbackParams } from 'echarts'

import type {
  AccountStatisticsItem,
  CategoryStatisticsItem,
  DailyStatisticsItem,
  LedgerStatisticsItem,
  MonthlyStatisticsItem,
  TagStatisticsItem,
} from '@/api/statistics'
import { amountToChartValue, formatCurrency, formatPercentage } from '@/utils/format'

interface CategoryChartData {
  name: string
  value: number
  amount: string
  percentage: string
  count: number
}

interface CalendarChartData extends Array<string | number> {
  0: string
  1: number
  2: string
  3: string
  4: number
}

const EXPENSE_COLOR = '#2563eb'
const INCOME_COLOR = '#0f766e'
const REFUND_COLOR = '#7c3aed'
const AXIS_COLOR = '#64748b'
const GRID_COLOR = '#e2e8f0'

const axisTooltipValueFormatter = (value: unknown): string => formatCurrency(String(value))

const baseCartesianOption = {
  grid: {
    top: 48,
    right: 24,
    bottom: 30,
    left: 72,
    containLabel: false,
  },
  tooltip: {
    trigger: 'axis',
    valueFormatter: axisTooltipValueFormatter,
  },
  textStyle: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  },
} satisfies EChartsCoreOption

export const createDailyChartOption = (data: DailyStatisticsItem[]): EChartsCoreOption => ({
  ...baseCartesianOption,
  aria: {
    enabled: true,
    description: '每日收支趋势，包含每日支出、普通收入和独立退款。',
  },
  legend: {
    top: 0,
    right: 0,
    data: ['支出', '收入', '退款'],
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: data.map((item) => item.date),
    axisLabel: {
      color: AXIS_COLOR,
      hideOverlap: true,
      formatter: (value: string) => value.slice(5),
    },
    axisLine: { lineStyle: { color: GRID_COLOR } },
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: AXIS_COLOR },
    splitLine: { lineStyle: { color: GRID_COLOR, type: 'dashed' } },
  },
  series: [
    {
      name: '支出',
      type: 'line',
      showSymbol: false,
      lineStyle: { width: 3 },
      itemStyle: { color: EXPENSE_COLOR },
      emphasis: { focus: 'series' },
      data: data.map((item) => amountToChartValue(item.expenseAmount)),
    },
    {
      name: '收入',
      type: 'line',
      showSymbol: false,
      lineStyle: { width: 2 },
      itemStyle: { color: INCOME_COLOR },
      emphasis: { focus: 'series' },
      data: data.map((item) => amountToChartValue(item.incomeAmount)),
    },
    {
      name: '退款',
      type: 'line',
      showSymbol: false,
      lineStyle: { width: 2, type: 'dashed' },
      itemStyle: { color: REFUND_COLOR },
      emphasis: { focus: 'series' },
      data: data.map((item) => amountToChartValue(item.refundAmount)),
    },
  ],
})

export const createMonthlyChartOption = (data: MonthlyStatisticsItem[]): EChartsCoreOption => ({
  ...baseCartesianOption,
  aria: {
    enabled: true,
    description: '月度收支趋势，包含最近十二个月或当前年份的支出、收入和退款。',
  },
  legend: {
    top: 0,
    right: 0,
    data: ['支出', '收入', '退款'],
  },
  xAxis: {
    type: 'category',
    data: data.map((item) => item.month),
    axisLabel: { color: AXIS_COLOR, hideOverlap: true },
    axisLine: { lineStyle: { color: GRID_COLOR } },
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: AXIS_COLOR },
    splitLine: { lineStyle: { color: GRID_COLOR, type: 'dashed' } },
  },
  series: [
    {
      name: '支出',
      type: 'bar',
      barMaxWidth: 20,
      itemStyle: { color: EXPENSE_COLOR, borderRadius: [3, 3, 0, 0] },
      data: data.map((item) => amountToChartValue(item.expenseAmount)),
    },
    {
      name: '收入',
      type: 'bar',
      barMaxWidth: 20,
      itemStyle: { color: INCOME_COLOR, borderRadius: [3, 3, 0, 0] },
      data: data.map((item) => amountToChartValue(item.incomeAmount)),
    },
    {
      name: '退款',
      type: 'bar',
      barMaxWidth: 20,
      itemStyle: { color: REFUND_COLOR, borderRadius: [3, 3, 0, 0] },
      data: data.map((item) => amountToChartValue(item.refundAmount)),
    },
  ],
})

export const createCategoryChartOption = (data: CategoryStatisticsItem[]): EChartsCoreOption => {
  const chartData: CategoryChartData[] = data.map((item) => ({
    name: item.categoryName,
    value: amountToChartValue(item.amount),
    amount: item.amount,
    percentage: item.percentage,
    count: item.count,
  }))

  return {
    aria: {
      enabled: true,
      description: '一级消费分类金额分布。',
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: TooltipComponentFormatterCallbackParams) => {
        const item = Array.isArray(params) ? params[0] : params
        const current = item.data as CategoryChartData
        return [
          current.name,
          `金额：${formatCurrency(current.amount)}`,
          `占比：${formatPercentage(current.percentage)}`,
          `笔数：${current.count} 笔`,
        ].join('<br/>')
      },
    },
    series: [
      {
        name: '消费分类',
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '48%'],
        avoidLabelOverlap: true,
        minAngle: 3,
        itemStyle: {
          borderColor: '#f8fafc',
          borderWidth: 2,
          borderRadius: 3,
        },
        label: {
          formatter: '{b}',
          color: '#334155',
        },
        emphasis: {
          scaleSize: 6,
        },
        data: chartData,
      },
    ],
  }
}

const createHorizontalBarOption = (
  names: string[],
  amounts: string[],
  description: string,
): EChartsCoreOption => ({
  ...baseCartesianOption,
  aria: {
    enabled: true,
    description,
  },
  grid: {
    top: 10,
    right: 24,
    bottom: 20,
    left: 104,
  },
  xAxis: {
    type: 'value',
    axisLabel: { color: AXIS_COLOR },
    splitLine: { lineStyle: { color: GRID_COLOR, type: 'dashed' } },
  },
  yAxis: {
    type: 'category',
    inverse: true,
    data: names,
    axisLabel: { color: '#334155', width: 88, overflow: 'truncate' },
    axisLine: { show: false },
    axisTick: { show: false },
  },
  series: [
    {
      type: 'bar',
      barMaxWidth: 18,
      itemStyle: { color: EXPENSE_COLOR, borderRadius: [0, 3, 3, 0] },
      data: amounts.map(amountToChartValue),
    },
  ],
})

export const createTagChartOption = (data: TagStatisticsItem[]): EChartsCoreOption =>
  createHorizontalBarOption(
    data.map((item) => item.tagName),
    data.map((item) => item.amount),
    '标签消费金额排行，标签金额允许重复归属。',
  )

export const createAccountChartOption = (data: AccountStatisticsItem[]): EChartsCoreOption =>
  createHorizontalBarOption(
    data.map((item) => item.accountName),
    data.map((item) => item.amount),
    '账户消费金额分布。',
  )

export const createLedgerChartOption = (data: LedgerStatisticsItem[]): EChartsCoreOption =>
  createHorizontalBarOption(
    data.map((item) => item.ledgerName),
    data.map((item) => item.expenseAmount),
    '全部账本的消费金额分布。',
  )

export const createCalendarChartOption = (
  month: string,
  data: DailyStatisticsItem[],
): EChartsCoreOption => {
  const chartData: CalendarChartData[] = data.map((item) => [
    item.date,
    amountToChartValue(item.expenseAmount),
    item.incomeAmount,
    item.refundAmount,
    item.count,
  ])
  const maxExpense = Math.max(1, ...chartData.map((item) => Number(item[1])))

  return {
    aria: {
      enabled: true,
      description: `${month} 每日消费热力图，颜色越深表示当天支出越高。`,
    },
    tooltip: {
      position: 'top',
      formatter: (params: TooltipComponentFormatterCallbackParams) => {
        const item = Array.isArray(params) ? params[0] : params
        const current = item.data as CalendarChartData
        return [
          current[0],
          `支出：${formatCurrency(String(current[1]))}`,
          `收入：${formatCurrency(String(current[2]))}`,
          `退款：${formatCurrency(String(current[3]))}`,
          `交易：${current[4]} 笔`,
        ].join('<br/>')
      },
    },
    visualMap: {
      min: 0,
      max: maxExpense,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: {
        color: ['#eff6ff', EXPENSE_COLOR],
      },
      text: ['高', '低'],
      textStyle: { color: AXIS_COLOR },
    },
    calendar: {
      top: 28,
      left: 52,
      right: 24,
      bottom: 54,
      range: month,
      cellSize: ['auto', 32],
      yearLabel: { show: false },
      monthLabel: { show: false },
      dayLabel: {
        firstDay: 1,
        nameMap: ['日', '一', '二', '三', '四', '五', '六'],
        color: AXIS_COLOR,
      },
      itemStyle: {
        color: '#f8fafc',
        borderColor: '#e2e8f0',
        borderWidth: 2,
      },
      splitLine: { show: false },
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: chartData,
      },
    ],
  }
}
