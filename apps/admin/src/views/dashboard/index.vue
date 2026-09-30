<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'
import dayjs, { type Dayjs } from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import type { EChartsCoreOption } from 'echarts'

import { getLedgersApi, type Ledger } from '@/api/ledger'
import { ApiError } from '@/api/request'
import {
  getAccountStatistics,
  getCalendarStatistics,
  getCategoryStatistics,
  getDailyStatistics,
  getLedgerStatistics,
  getMonthlyStatistics,
  getStatisticsOverview,
  getTagStatistics,
  getTopTransactions,
  type AccountStatisticsItem,
  type CategoryStatisticsItem,
  type DailyStatisticsItem,
  type LedgerStatisticsItem,
  type MonthlyStatisticsItem,
  type StatisticsOverview,
  type StatisticsRangeQuery,
  type TagStatisticsItem,
  type TopTransactionItem,
} from '@/api/statistics'
import BaseChart from '@/components/charts/BaseChart.vue'
import { formatCurrency, formatPercentage } from '@/utils/format'

import {
  createAccountChartOption,
  createCalendarChartOption,
  createCategoryChartOption,
  createDailyChartOption,
  createLedgerChartOption,
  createMonthlyChartOption,
  createTagChartOption,
} from './chart-options'

type TimePreset = 'CURRENT_MONTH' | 'PREVIOUS_MONTH' | 'LAST_30_DAYS' | 'CURRENT_YEAR' | 'CUSTOM'
type DashboardModule =
  | 'overview'
  | 'daily'
  | 'monthly'
  | 'categories'
  | 'calendar'
  | 'tags'
  | 'accounts'
  | 'ledgers'
  | 'topTransactions'

interface RadioChangeEvent {
  target: {
    value: TimePreset
  }
}

interface OverviewMetric {
  label: string
  value: string
  hint: string
  tone: 'default' | 'income' | 'refund' | 'negative'
}

interface ModuleResultConfig<T> {
  module: DashboardModule
  result: PromiseSettledResult<T>
  apply: (value: T) => void
}

dayjs.extend(utc)
dayjs.extend(timezone)

const PRODUCT_TIMEZONE = 'Asia/Shanghai'
const DEFAULT_SCOPE = 'DEFAULT'
const ALL_SCOPE = 'ALL'
const dashboardModules: DashboardModule[] = [
  'overview',
  'daily',
  'monthly',
  'categories',
  'calendar',
  'tags',
  'accounts',
  'ledgers',
  'topTransactions',
]
const timePresetOptions = [
  { label: '本月', value: 'CURRENT_MONTH' },
  { label: '上月', value: 'PREVIOUS_MONTH' },
  { label: '最近30天', value: 'LAST_30_DAYS' },
  { label: '本年', value: 'CURRENT_YEAR' },
  { label: '自定义', value: 'CUSTOM' },
]
const topTransactionColumns: TableColumnsType<TopTransactionItem> = [
  { title: '时间', dataIndex: 'transactionTime', key: 'transactionTime', width: 130 },
  { title: '商户 / 描述', key: 'summary', ellipsis: true },
  { title: '分类', dataIndex: 'category', key: 'category', width: 120 },
  { title: '账本', dataIndex: 'ledger', key: 'ledger', width: 120 },
  { title: '金额', dataIndex: 'amount', key: 'amount', width: 140, align: 'right' },
  { title: '', key: 'action', width: 72, align: 'right' },
]

const router = useRouter()

const getShanghaiNow = (): Dayjs => dayjs().tz(PRODUCT_TIMEZONE)
const getPresetRange = (preset: Exclude<TimePreset, 'CUSTOM'>): [Dayjs, Dayjs] => {
  const now = getShanghaiNow()

  if (preset === 'PREVIOUS_MONTH') {
    const previousMonth = now.subtract(1, 'month')
    return [previousMonth.startOf('month'), previousMonth.endOf('month')]
  }

  if (preset === 'LAST_30_DAYS') {
    return [now.subtract(29, 'day').startOf('day'), now.endOf('day')]
  }

  if (preset === 'CURRENT_YEAR') {
    return [now.startOf('year'), now.endOf('year')]
  }

  return [now.startOf('month'), now.endOf('month')]
}

const timePreset = ref<TimePreset>('CURRENT_MONTH')
const selectedRange = ref<[Dayjs, Dayjs]>(getPresetRange('CURRENT_MONTH'))
const ledgerSelection = ref<string>(DEFAULT_SCOPE)
const calendarMonth = ref<Dayjs>(selectedRange.value[1].startOf('month'))
const ledgers = ref<Ledger[]>([])
const ledgerOptionsLoading = ref(false)
const overview = ref<StatisticsOverview | null>(null)
const dailyStatistics = ref<DailyStatisticsItem[]>([])
const monthlyStatistics = ref<MonthlyStatisticsItem[]>([])
const categoryStatistics = ref<CategoryStatisticsItem[]>([])
const calendarStatistics = ref<DailyStatisticsItem[]>([])
const tagStatistics = ref<TagStatisticsItem[]>([])
const accountStatistics = ref<AccountStatisticsItem[]>([])
const ledgerStatistics = ref<LedgerStatisticsItem[]>([])
const topTransactions = ref<TopTransactionItem[]>([])
const dashboardRequestVersion = ref(0)
const calendarRequestVersion = ref(0)
const moduleLoading = reactive<Record<DashboardModule, boolean>>({
  overview: true,
  daily: true,
  monthly: true,
  categories: true,
  calendar: true,
  tags: true,
  accounts: true,
  ledgers: true,
  topTransactions: true,
})
const moduleErrors = reactive<Record<DashboardModule, string | null>>({
  overview: null,
  daily: null,
  monthly: null,
  categories: null,
  calendar: null,
  tags: null,
  accounts: null,
  ledgers: null,
  topTransactions: null,
})

const selectedScope = computed<'DEFAULT' | 'ALL'>(() =>
  ledgerSelection.value === ALL_SCOPE ? 'ALL' : 'DEFAULT',
)
const selectedLedgerId = computed<string | undefined>(() =>
  ledgerSelection.value === DEFAULT_SCOPE || ledgerSelection.value === ALL_SCOPE
    ? undefined
    : ledgerSelection.value,
)
const ledgerOptions = computed(() => [
  { label: '默认账本', value: DEFAULT_SCOPE },
  { label: '全部账本', value: ALL_SCOPE },
  ...ledgers.value.map((item) => ({
    label: item.isDefault ? `${item.name}（默认）` : item.name,
    value: item.id,
  })),
])
const dashboardQuery = computed<StatisticsRangeQuery>(() => ({
  startDate: selectedRange.value[0].format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
  endDate: selectedRange.value[1].format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
  scope: selectedScope.value,
  ledgerId: selectedLedgerId.value,
}))
const monthlyQuery = computed<StatisticsRangeQuery>(() => {
  const endMonth = selectedRange.value[1].tz(PRODUCT_TIMEZONE)
  const monthlyStart =
    timePreset.value === 'CURRENT_YEAR'
      ? endMonth.startOf('year')
      : endMonth.startOf('month').subtract(11, 'month')
  const monthlyEnd =
    timePreset.value === 'CURRENT_YEAR' ? endMonth.endOf('year') : endMonth.endOf('month')

  return {
    ...dashboardQuery.value,
    startDate: monthlyStart.format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
    endDate: monthlyEnd.format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
  }
})
const calendarQuery = computed(() => ({
  month: calendarMonth.value.format('YYYY-MM'),
  scope: selectedScope.value,
  ledgerId: selectedLedgerId.value,
}))
const selectedRangeLabel = computed(
  () =>
    `${selectedRange.value[0].format('YYYY-MM-DD')} 至 ${selectedRange.value[1].format('YYYY-MM-DD')}`,
)
const monthlyRangeLabel = computed(() => {
  if (timePreset.value === 'CURRENT_YEAR') return `${selectedRange.value[1].format('YYYY')} 年`
  return `${monthlyQuery.value.startDate.slice(0, 7)} 至 ${monthlyQuery.value.endDate.slice(0, 7)}`
})
const overviewMetrics = computed<OverviewMetric[]>(() => {
  if (!overview.value) return []

  return [
    {
      label: '本期支出',
      value: formatCurrency(overview.value.expenseAmount),
      hint: `${overview.value.expenseCount} 笔消费`,
      tone: 'default',
    },
    {
      label: '本期收入',
      value: formatCurrency(overview.value.incomeAmount),
      hint: `${overview.value.incomeCount} 笔普通收入`,
      tone: 'income',
    },
    {
      label: '退款',
      value: formatCurrency(overview.value.refundAmount),
      hint: `${overview.value.refundCount} 笔独立退款`,
      tone: 'refund',
    },
    {
      label: '净现金流',
      value: formatCurrency(overview.value.netCashFlow),
      hint: `共 ${overview.value.transactionCount} 笔交易`,
      tone: overview.value.netCashFlow.startsWith('-') ? 'negative' : 'income',
    },
  ]
})
const dailyHasData = computed(() => dailyStatistics.value.some((item) => item.count > 0))
const monthlyHasData = computed(() => monthlyStatistics.value.some((item) => item.count > 0))
const calendarHasData = computed(() => calendarStatistics.value.some((item) => item.count > 0))
const visibleTagStatistics = computed(() => tagStatistics.value.slice(0, 10))
const visibleAccountStatistics = computed(() => accountStatistics.value.slice(0, 10))
const showLedgerDistribution = computed(
  () => ledgerSelection.value === ALL_SCOPE && ledgerStatistics.value.length > 1,
)
const dailyChartOption = computed<EChartsCoreOption>(() =>
  createDailyChartOption(dailyStatistics.value),
)
const monthlyChartOption = computed<EChartsCoreOption>(() =>
  createMonthlyChartOption(monthlyStatistics.value),
)
const categoryChartOption = computed<EChartsCoreOption>(() =>
  createCategoryChartOption(categoryStatistics.value),
)
const calendarChartOption = computed<EChartsCoreOption>(() =>
  createCalendarChartOption(calendarMonth.value.format('YYYY-MM'), calendarStatistics.value),
)
const tagChartOption = computed<EChartsCoreOption>(() =>
  createTagChartOption(visibleTagStatistics.value),
)
const accountChartOption = computed<EChartsCoreOption>(() =>
  createAccountChartOption(visibleAccountStatistics.value),
)
const ledgerChartOption = computed<EChartsCoreOption>(() =>
  createLedgerChartOption(ledgerStatistics.value),
)

const getErrorMessage = (error: unknown): string =>
  error instanceof ApiError ? error.message : '数据加载失败，请稍后重试'

const setAllModulesLoading = (loading: boolean) => {
  dashboardModules.forEach((module) => {
    moduleLoading[module] = loading
    if (loading) moduleErrors[module] = null
  })
}

const applyModuleResult = <T,>(config: ModuleResultConfig<T>) => {
  if (config.result.status === 'fulfilled') {
    config.apply(config.result.value)
    moduleErrors[config.module] = null
    return
  }

  console.error(config.result.reason)
  moduleErrors[config.module] = getErrorMessage(config.result.reason)
}

const getLedgerOptions = async () => {
  try {
    ledgerOptionsLoading.value = true
    ledgers.value = await getLedgersApi()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '获取账本选项失败')
  } finally {
    ledgerOptionsLoading.value = false
  }
}

const getDashboardData = async () => {
  const requestVersion = ++dashboardRequestVersion.value
  const currentCalendarVersion = ++calendarRequestVersion.value
  setAllModulesLoading(true)

  try {
    const commonQuery = dashboardQuery.value
    const [
      overviewResult,
      dailyResult,
      monthlyResult,
      categoryResult,
      calendarResult,
      tagResult,
      accountResult,
      ledgerResult,
      topResult,
    ] = await Promise.allSettled([
      getStatisticsOverview(commonQuery),
      getDailyStatistics(commonQuery),
      getMonthlyStatistics(monthlyQuery.value),
      getCategoryStatistics({ ...commonQuery, type: 'EXPENSE', level: 1 }),
      getCalendarStatistics(calendarQuery.value),
      getTagStatistics(commonQuery),
      getAccountStatistics(commonQuery),
      getLedgerStatistics({
        startDate: commonQuery.startDate,
        endDate: commonQuery.endDate,
      }),
      getTopTransactions({ ...commonQuery, limit: 10 }),
    ])

    if (requestVersion !== dashboardRequestVersion.value) return

    applyModuleResult({
      module: 'overview',
      result: overviewResult,
      apply: (value) => (overview.value = value),
    })
    applyModuleResult({
      module: 'daily',
      result: dailyResult,
      apply: (value) => (dailyStatistics.value = value),
    })
    applyModuleResult({
      module: 'monthly',
      result: monthlyResult,
      apply: (value) => (monthlyStatistics.value = value),
    })
    applyModuleResult({
      module: 'categories',
      result: categoryResult,
      apply: (value) => (categoryStatistics.value = value),
    })
    if (currentCalendarVersion === calendarRequestVersion.value) {
      applyModuleResult({
        module: 'calendar',
        result: calendarResult,
        apply: (value) => (calendarStatistics.value = value),
      })
    }
    applyModuleResult({
      module: 'tags',
      result: tagResult,
      apply: (value) => (tagStatistics.value = value),
    })
    applyModuleResult({
      module: 'accounts',
      result: accountResult,
      apply: (value) => (accountStatistics.value = value),
    })
    applyModuleResult({
      module: 'ledgers',
      result: ledgerResult,
      apply: (value) => (ledgerStatistics.value = value),
    })
    applyModuleResult({
      module: 'topTransactions',
      result: topResult,
      apply: (value) => (topTransactions.value = value),
    })
  } catch (error) {
    console.error(error)
    const errorMessage = getErrorMessage(error)
    dashboardModules.forEach((module) => {
      moduleErrors[module] = errorMessage
    })
  } finally {
    if (requestVersion === dashboardRequestVersion.value) setAllModulesLoading(false)
  }
}

const getCalendarData = async () => {
  const requestVersion = ++calendarRequestVersion.value
  moduleLoading.calendar = true
  moduleErrors.calendar = null

  try {
    const result = await getCalendarStatistics(calendarQuery.value)
    if (requestVersion !== calendarRequestVersion.value) return
    calendarStatistics.value = result
  } catch (error) {
    console.error(error)
    if (requestVersion === calendarRequestVersion.value) {
      moduleErrors.calendar = getErrorMessage(error)
    }
  } finally {
    if (requestVersion === calendarRequestVersion.value) moduleLoading.calendar = false
  }
}

const handleTimePresetChange = (event: RadioChangeEvent) => {
  const nextPreset = event.target.value
  timePreset.value = nextPreset
  if (nextPreset === 'CUSTOM') return

  selectedRange.value = getPresetRange(nextPreset)
  calendarMonth.value = selectedRange.value[1].startOf('month')
  void getDashboardData()
}

const handleCustomRangeChange = (range: [Dayjs, Dayjs] | null) => {
  if (!range) return

  const startDate = dayjs.tz(range[0].format('YYYY-MM-DD'), PRODUCT_TIMEZONE).startOf('day')
  const endDate = dayjs.tz(range[1].format('YYYY-MM-DD'), PRODUCT_TIMEZONE).endOf('day')
  selectedRange.value = [startDate, endDate]
  calendarMonth.value = endDate.startOf('month')
  void getDashboardData()
}

const handleLedgerChange = () => {
  void getDashboardData()
}

const handleCalendarMonthChange = (month: Dayjs | null) => {
  if (!month) return
  calendarMonth.value = dayjs.tz(month.format('YYYY-MM-01'), PRODUCT_TIMEZONE)
  void getCalendarData()
}

const handleRetry = () => {
  void getDashboardData()
}

const handleCalendarRetry = () => {
  void getCalendarData()
}

const handleViewTransactions = () => {
  void router.push('/transactions')
}

const formatTransactionTime = (value: string): string =>
  dayjs(value).tz(PRODUCT_TIMEZONE).format('YYYY-MM-DD HH:mm')

onMounted(() => {
  void getLedgerOptions()
  void getDashboardData()
})
</script>

<template>
  <main class="dashboard-page-wrapper">
    <header class="dashboard-header">
      <div>
        <h1 class="dashboard-title">财务概览</h1>
        <p class="dashboard-subtitle">{{ selectedRangeLabel }}，所有数据均来自统一统计口径</p>
      </div>

      <div class="dashboard-filters" aria-label="统计范围筛选">
        <a-radio-group
          v-model:value="timePreset"
          :options="timePresetOptions"
          option-type="button"
          button-style="solid"
          @change="handleTimePresetChange"
        />
        <a-range-picker
          v-if="timePreset === 'CUSTOM'"
          :value="selectedRange"
          format="YYYY-MM-DD"
          :allow-clear="false"
          @change="handleCustomRangeChange"
        />
        <a-select
          v-model:value="ledgerSelection"
          class="ledger-select"
          :loading="ledgerOptionsLoading"
          :options="ledgerOptions"
          show-search
          option-filter-prop="label"
          @change="handleLedgerChange"
        />
      </div>
    </header>

    <section class="overview-panel" aria-labelledby="overview-title">
      <div class="section-heading">
        <div>
          <h2 id="overview-title">本期概览</h2>
          <span>收入与退款独立展示，支出使用退款后的最终净额</span>
        </div>
      </div>
      <a-skeleton v-if="moduleLoading.overview" active :paragraph="{ rows: 2 }" />
      <a-alert
        v-else-if="moduleErrors.overview"
        type="error"
        show-icon
        :message="moduleErrors.overview"
      >
        <template #action>
          <a-button size="small" @click="handleRetry">重试</a-button>
        </template>
      </a-alert>
      <div v-else class="overview-metrics">
        <article
          v-for="item in overviewMetrics"
          :key="item.label"
          class="overview-metric"
          :class="`overview-metric-${item.tone}`"
        >
          <span class="overview-metric-label">{{ item.label }}</span>
          <strong class="overview-metric-value">{{ item.value }}</strong>
          <span class="overview-metric-hint">{{ item.hint }}</span>
        </article>
      </div>
    </section>

    <section class="dashboard-panel dashboard-panel-wide" aria-labelledby="daily-title">
      <div class="section-heading">
        <div>
          <h2 id="daily-title">每日收支趋势</h2>
          <span>支出、普通收入与退款按 Asia/Shanghai 日期展示</span>
        </div>
      </div>
      <a-skeleton v-if="moduleLoading.daily" active :paragraph="{ rows: 6 }" />
      <a-alert v-else-if="moduleErrors.daily" type="error" show-icon :message="moduleErrors.daily">
        <template #action><a-button size="small" @click="handleRetry">重试</a-button></template>
      </a-alert>
      <a-empty v-else-if="!dailyHasData" description="当前时间范围暂无账单数据" />
      <BaseChart v-else :option="dailyChartOption" height="340px" />
    </section>

    <div class="dashboard-grid">
      <section class="dashboard-panel" aria-labelledby="category-title">
        <div class="section-heading">
          <div>
            <h2 id="category-title">消费分类</h2>
            <span>按一级分类汇总，包含未分类账单</span>
          </div>
        </div>
        <a-skeleton v-if="moduleLoading.categories" active :paragraph="{ rows: 6 }" />
        <a-alert
          v-else-if="moduleErrors.categories"
          type="error"
          show-icon
          :message="moduleErrors.categories"
        >
          <template #action><a-button size="small" @click="handleRetry">重试</a-button></template>
        </a-alert>
        <a-empty v-else-if="!categoryStatistics.length" description="当前时间范围暂无分类数据" />
        <div v-else class="category-content">
          <BaseChart :option="categoryChartOption" height="300px" />
          <ol class="category-ranking">
            <li
              v-for="(item, index) in categoryStatistics.slice(0, 6)"
              :key="item.categoryId || 'uncategorized'"
            >
              <span class="ranking-index">{{ index + 1 }}</span>
              <span class="ranking-name">{{ item.categoryName }}</span>
              <span class="ranking-meta"
                >{{ formatPercentage(item.percentage) }} · {{ item.count }}笔</span
              >
              <strong>{{ formatCurrency(item.amount) }}</strong>
            </li>
          </ol>
        </div>
      </section>

      <section class="dashboard-panel" aria-labelledby="monthly-title">
        <div class="section-heading">
          <div>
            <h2 id="monthly-title">月度收支趋势</h2>
            <span>{{ monthlyRangeLabel }}</span>
          </div>
        </div>
        <a-skeleton v-if="moduleLoading.monthly" active :paragraph="{ rows: 6 }" />
        <a-alert
          v-else-if="moduleErrors.monthly"
          type="error"
          show-icon
          :message="moduleErrors.monthly"
        >
          <template #action><a-button size="small" @click="handleRetry">重试</a-button></template>
        </a-alert>
        <a-empty v-else-if="!monthlyHasData" description="当前月份窗口暂无账单数据" />
        <BaseChart v-else :option="monthlyChartOption" height="390px" />
      </section>
    </div>

    <section class="dashboard-panel dashboard-panel-wide" aria-labelledby="calendar-title">
      <div class="section-heading section-heading-with-action">
        <div>
          <h2 id="calendar-title">日历消费</h2>
          <span>颜色深浅表示每日支出，不改变顶部统一账本范围</span>
        </div>
        <a-date-picker
          :value="calendarMonth"
          picker="month"
          format="YYYY-MM"
          :allow-clear="false"
          @change="handleCalendarMonthChange"
        />
      </div>
      <a-skeleton v-if="moduleLoading.calendar" active :paragraph="{ rows: 5 }" />
      <a-alert
        v-else-if="moduleErrors.calendar"
        type="error"
        show-icon
        :message="moduleErrors.calendar"
      >
        <template #action
          ><a-button size="small" @click="handleCalendarRetry">重试</a-button></template
        >
      </a-alert>
      <a-empty v-else-if="!calendarHasData" description="该月份暂无账单数据" />
      <BaseChart v-else :option="calendarChartOption" height="300px" />
    </section>

    <div class="dashboard-grid">
      <section class="dashboard-panel" aria-labelledby="tag-title">
        <div class="section-heading">
          <div>
            <h2 id="tag-title">标签消费排行</h2>
            <span>同一账单可完整归属多个标签，标签金额不与总支出对账</span>
          </div>
        </div>
        <a-skeleton v-if="moduleLoading.tags" active :paragraph="{ rows: 5 }" />
        <a-alert v-else-if="moduleErrors.tags" type="error" show-icon :message="moduleErrors.tags">
          <template #action><a-button size="small" @click="handleRetry">重试</a-button></template>
        </a-alert>
        <a-empty v-else-if="!visibleTagStatistics.length" description="当前时间范围暂无标签数据" />
        <BaseChart v-else :option="tagChartOption" height="320px" />
      </section>

      <section class="dashboard-panel" aria-labelledby="account-title">
        <div class="section-heading">
          <div>
            <h2 id="account-title">账户消费分布</h2>
            <span>展示前 10 个账户及未指定账户</span>
          </div>
        </div>
        <a-skeleton v-if="moduleLoading.accounts" active :paragraph="{ rows: 5 }" />
        <a-alert
          v-else-if="moduleErrors.accounts"
          type="error"
          show-icon
          :message="moduleErrors.accounts"
        >
          <template #action><a-button size="small" @click="handleRetry">重试</a-button></template>
        </a-alert>
        <a-empty
          v-else-if="!visibleAccountStatistics.length"
          description="当前时间范围暂无账户数据"
        />
        <BaseChart v-else :option="accountChartOption" height="320px" />
      </section>
    </div>

    <section
      v-if="showLedgerDistribution"
      class="dashboard-panel dashboard-panel-wide"
      aria-labelledby="ledger-title"
    >
      <div class="section-heading">
        <div>
          <h2 id="ledger-title">账本消费分布</h2>
          <span>仅在全部账本范围下展示</span>
        </div>
      </div>
      <a-skeleton v-if="moduleLoading.ledgers" active :paragraph="{ rows: 5 }" />
      <a-alert
        v-else-if="moduleErrors.ledgers"
        type="error"
        show-icon
        :message="moduleErrors.ledgers"
      >
        <template #action><a-button size="small" @click="handleRetry">重试</a-button></template>
      </a-alert>
      <BaseChart v-else :option="ledgerChartOption" height="280px" />
    </section>

    <section class="dashboard-panel dashboard-panel-wide" aria-labelledby="top-transactions-title">
      <div class="section-heading section-heading-with-action">
        <div>
          <h2 id="top-transactions-title">大额消费</h2>
          <span>当前筛选范围内金额最高的 10 笔支出</span>
        </div>
        <a-button type="link" @click="handleViewTransactions">查看全部账单</a-button>
      </div>
      <a-alert
        v-if="moduleErrors.topTransactions"
        type="error"
        show-icon
        :message="moduleErrors.topTransactions"
      >
        <template #action><a-button size="small" @click="handleRetry">重试</a-button></template>
      </a-alert>
      <a-table
        v-else
        :columns="topTransactionColumns"
        :data-source="topTransactions"
        :loading="moduleLoading.topTransactions"
        :pagination="false"
        :scroll="{ x: 720 }"
        row-key="id"
        size="middle"
      >
        <template #emptyText>
          <a-empty description="当前时间范围暂无大额消费" />
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'transactionTime'">
            {{ formatTransactionTime(record.transactionTime) }}
          </template>
          <template v-else-if="column.key === 'summary'">
            <div class="transaction-summary">
              <strong>{{ record.merchant || record.description || '未命名消费' }}</strong>
              <span v-if="record.merchant && record.description">{{ record.description }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'category'">
            {{ record.category?.name || '未分类' }}
          </template>
          <template v-else-if="column.key === 'ledger'">
            {{ record.ledger.name }}
          </template>
          <template v-else-if="column.key === 'amount'">
            <strong class="expense-amount">{{ formatCurrency(record.amount) }}</strong>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" size="small" @click="handleViewTransactions">查看</a-button>
          </template>
        </template>
      </a-table>
    </section>
  </main>
</template>

<style scoped lang="less">
.dashboard-page-wrapper {
  display: flex;
  flex-direction: column;
  gap: 20px;
  color: #172033;
}

.dashboard-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.dashboard-title {
  margin: 0;
  font-size: 24px;
  font-weight: 650;
  line-height: 1.3;
}

.dashboard-subtitle {
  margin: 6px 0 0;
  color: #667085;
  font-size: 13px;
}

.dashboard-filters {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.ledger-select {
  width: 180px;
}

.overview-panel,
.dashboard-panel {
  min-width: 0;
  padding: 20px;
  background: #fdfefe;
  border: 1px solid #e7ebf0;
  border-radius: 8px;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  h2 {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 650;
    line-height: 1.4;
  }

  span {
    color: #667085;
    font-size: 12px;
  }
}

.section-heading-with-action {
  align-items: center;
}

.overview-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.overview-metric {
  display: flex;
  min-width: 0;
  padding: 8px 24px;
  flex-direction: column;
  border-right: 1px solid #e7ebf0;

  &:first-child {
    padding-left: 4px;
  }

  &:last-child {
    padding-right: 4px;
    border-right: 0;
  }
}

.overview-metric-label,
.overview-metric-hint {
  color: #667085;
  font-size: 13px;
}

.overview-metric-value {
  margin: 8px 0 6px;
  color: #172033;
  font-size: 28px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.overview-metric-income .overview-metric-value {
  color: #0f766e;
}

.overview-metric-refund .overview-metric-value {
  color: #6d28d9;
}

.overview-metric-negative .overview-metric-value,
.expense-amount {
  color: #b42318;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.category-content {
  display: grid;
  grid-template-columns: minmax(220px, 0.9fr) minmax(240px, 1.1fr);
  align-items: center;
  gap: 12px;
}

.category-ranking {
  display: flex;
  min-width: 0;
  margin: 0;
  padding: 0;
  flex-direction: column;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: 24px minmax(72px, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid #eef1f4;

    &:last-child {
      border-bottom: 0;
    }
  }
}

.ranking-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: #475467;
  font-size: 12px;
  background: #f1f4f8;
  border-radius: 50%;
}

.ranking-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-meta {
  color: #667085;
  font-size: 12px;
  white-space: nowrap;
}

.transaction-summary {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: #667085;
    font-size: 12px;
  }
}

@media (max-width: 1360px) {
  .dashboard-header {
    flex-direction: column;
  }

  .dashboard-filters {
    justify-content: flex-start;
  }

  .category-content {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1120px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .overview-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: 20px;
  }

  .overview-metric:nth-child(2) {
    border-right: 0;
  }
}

@media (max-width: 760px) {
  .dashboard-filters,
  .dashboard-filters :deep(.ant-picker),
  .ledger-select {
    width: 100%;
  }

  .overview-metrics {
    grid-template-columns: 1fr;
  }

  .overview-metric {
    padding: 16px 4px;
    border-right: 0;
    border-bottom: 1px solid #e7ebf0;

    &:last-child {
      border-bottom: 0;
    }
  }

  .section-heading-with-action {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
