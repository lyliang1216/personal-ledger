<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue'
import dayjs from 'dayjs'
import { useRoute, useRouter } from 'vue-router'

import { getAccountsApi, type Account } from '@/api/account'
import { getCategoriesApi, type Category } from '@/api/category'
import {
  batchIgnoreImportRecordsApi,
  batchRestoreImportRecordsApi,
  confirmImportTaskApi,
  getImportRecordsApi,
  getImportTaskApi,
  ignoreImportRecordApi,
  restoreImportRecordApi,
  updateImportDecisionApi,
  type ImportRecord,
  type ImportRecordStatus,
  type ImportReconcileStatus,
  type ImportTask,
} from '@/api/import'
import { getLedgersApi, type Ledger } from '@/api/ledger'
import { ApiError } from '@/api/request'
import { getTagsApi, type LedgerTag } from '@/api/tag'
import { transactionSourceLabels } from '@/api/transaction'

import BatchUpdateModal from './components/BatchUpdateModal.vue'
import ChangedComparisonDrawer from './components/ChangedComparisonDrawer.vue'
import ImportRecordDrawer from './components/ImportRecordDrawer.vue'
import PossibleMatchModal from './components/PossibleMatchModal.vue'
import RawDataModal from './components/RawDataModal.vue'

type BatchMode = 'CATEGORY' | 'TAG' | 'LEDGER' | 'ACCOUNT'

interface SearchForm {
  keyword: string
  status: ImportRecordStatus | undefined
  reconcileStatus: ImportReconcileStatus | undefined
  categoryId: string | undefined
  tagId: string | undefined
  ledgerId: string | undefined
  accountId: string | undefined
}

interface PaginationState {
  current: number
  pageSize: number
  total: number
}

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const optionsLoading = ref(false)
const confirming = ref(false)
const task = ref<ImportTask | null>(null)
const tableData = ref<ImportRecord[]>([])
const selectedRowKeys = ref<string[]>([])
const ledgers = ref<Ledger[]>([])
const categories = ref<Category[]>([])
const tags = ref<LedgerTag[]>([])
const accounts = ref<Account[]>([])
const recordDrawerVisible = ref(false)
const editingRecordId = ref<string | null>(null)
const matchModalVisible = ref(false)
const matchingRecord = ref<ImportRecord | null>(null)
const changedDrawerVisible = ref(false)
const changedRecord = ref<ImportRecord | null>(null)
const batchModalVisible = ref(false)
const batchMode = ref<BatchMode>('CATEGORY')
const rawDataVisible = ref(false)
const activeRawData = ref<unknown>()
const searchForm = reactive<SearchForm>({
  keyword: '',
  status: undefined,
  reconcileStatus: undefined,
  categoryId: undefined,
  tagId: undefined,
  ledgerId: undefined,
  accountId: undefined,
})
const pagination = reactive<PaginationState>({ current: 1, pageSize: 20, total: 0 })

const taskId = computed(() => String(route.params.id))
const isPreview = computed(() => task.value?.status === 'PREVIEW')
const selectedCount = computed(() => selectedRowKeys.value.length)
const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: (string | number)[]) => {
    selectedRowKeys.value = keys.map(String)
  },
}))
const paginationConfig = computed(() => ({
  current: pagination.current,
  pageSize: pagination.pageSize,
  total: pagination.total,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
}))
const ledgerOptions = computed(() =>
  ledgers.value.map((item) => ({ label: item.name, value: item.id })),
)
const categoryOptions = computed(() =>
  categories.value.map((item) => ({ label: item.name, value: item.id })),
)
const tagOptions = computed(() => tags.value.map((item) => ({ label: item.name, value: item.id })))
const accountOptions = computed(() =>
  accounts.value.map((item) => ({ label: item.name, value: item.id })),
)

const columns: TableColumnsType<ImportRecord> = [
  { title: '对账状态', dataIndex: 'reconcileStatus', key: 'reconcileStatus', width: 135 },
  { title: '处理状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '交易时间', dataIndex: 'transactionTime', key: 'transactionTime', width: 170 },
  { title: '收支', dataIndex: 'type', key: 'type', width: 76 },
  {
    title: '原始金额',
    dataIndex: 'sourceAmount',
    key: 'sourceAmount',
    width: 115,
    align: 'right',
  },
  { title: '统计金额', dataIndex: 'amount', key: 'amount', width: 115, align: 'right' },
  { title: '商户 / 说明', key: 'summary', width: 220 },
  { title: '用户备注', dataIndex: 'remark', key: 'remark', width: 150 },
  { title: '分类', dataIndex: 'category', key: 'category', width: 110 },
  { title: '标签', dataIndex: 'tags', key: 'tags', width: 160 },
  { title: '账户', dataIndex: 'account', key: 'account', width: 110 },
  { title: '账本', dataIndex: 'ledger', key: 'ledger', width: 110 },
  { title: '平台事实', key: 'sourceFact', width: 260 },
  { title: '匹配说明', dataIndex: 'reconcileReason', key: 'reconcileReason', width: 230 },
  { title: '处理决定', dataIndex: 'decision', key: 'decision', width: 125 },
  { title: '操作', key: 'action', width: 280, fixed: 'right' },
]

const statusOptions = [
  { label: '全部', value: undefined },
  { label: '待处理', value: 'READY' },
  { label: '已忽略', value: 'IGNORED' },
  { label: '错误', value: 'ERROR' },
  { label: '已导入', value: 'IMPORTED' },
]
const reconcileOptions = [
  { label: '全部', value: undefined },
  { label: '新记录', value: 'NEW' },
  { label: '无变化', value: 'UNCHANGED' },
  { label: '有变化', value: 'CHANGED' },
  { label: '自动匹配', value: 'AUTO_MATCH' },
  { label: '疑似匹配', value: 'POSSIBLE_MATCH' },
  { label: '暂不支持', value: 'UNSUPPORTED' },
]
const reconcileLabels: Record<ImportReconcileStatus, string> = {
  NEW: '新记录',
  UNCHANGED: '无变化',
  CHANGED: '有变化',
  AUTO_MATCH: '自动匹配',
  POSSIBLE_MATCH: '疑似匹配',
  UNSUPPORTED: '暂不支持',
}
const reconcileColors: Record<ImportReconcileStatus, string> = {
  NEW: 'blue',
  UNCHANGED: 'default',
  CHANGED: 'orange',
  AUTO_MATCH: 'green',
  POSSIBLE_MATCH: 'gold',
  UNSUPPORTED: 'red',
}
const decisionLabels = {
  PENDING: '等待处理',
  CREATE_NEW: '创建新账单',
  LINK_EXISTING: '关联已有',
  APPLY_CHANGE: '应用变化',
} as const
const statusLabels: Record<ImportRecordStatus, string> = {
  PENDING: '等待中',
  READY: '待处理',
  DUPLICATE: '重复',
  IGNORED: '已忽略',
  IMPORTED: '已导入',
  ERROR: '错误',
}

const summaryItems = computed(() => [
  { label: '新增', value: task.value?.reconcileCounts.NEW || 0 },
  { label: '未变化', value: task.value?.reconcileCounts.UNCHANGED || 0 },
  { label: '历史变化', value: task.value?.reconcileCounts.CHANGED || 0 },
  { label: '自动匹配', value: task.value?.reconcileCounts.AUTO_MATCH || 0 },
  { label: '待确认', value: task.value?.reconcileCounts.POSSIBLE_MATCH || 0 },
  { label: '未支持', value: task.value?.reconcileCounts.UNSUPPORTED || 0 },
  { label: '已忽略', value: task.value?.statusCounts.IGNORED || 0 },
  { label: '已导入', value: task.value?.statusCounts.IMPORTED || 0 },
])

const loadTask = async () => {
  try {
    task.value = await getImportTaskApi(taskId.value)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '获取导入任务失败')
  }
}

const loadRecords = async () => {
  try {
    loading.value = true
    const result = await getImportRecordsApi(taskId.value, {
      keyword: searchForm.keyword.trim() || undefined,
      status: searchForm.status,
      reconcileStatus: searchForm.reconcileStatus,
      categoryId: searchForm.categoryId,
      tagId: searchForm.tagId,
      ledgerId: searchForm.ledgerId,
      accountId: searchForm.accountId,
      page: pagination.current,
      pageSize: pagination.pageSize,
    })
    tableData.value = result.items
    pagination.total = result.total
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '获取预览记录失败')
  } finally {
    loading.value = false
  }
}

const loadOptions = async () => {
  try {
    optionsLoading.value = true
    const [ledgerList, categoryList, tagList, accountList] = await Promise.all([
      getLedgersApi(),
      getCategoriesApi(),
      getTagsApi(),
      getAccountsApi(),
    ])
    ledgers.value = ledgerList
    categories.value = categoryList
    tags.value = tagList
    accounts.value = accountList
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '获取整理选项失败')
  } finally {
    optionsLoading.value = false
  }
}

const refresh = async () => {
  selectedRowKeys.value = []
  await Promise.all([loadTask(), loadRecords()])
}

const handleSearch = () => {
  pagination.current = 1
  selectedRowKeys.value = []
  void loadRecords()
}

const handleReset = () => {
  searchForm.keyword = ''
  searchForm.status = undefined
  searchForm.reconcileStatus = undefined
  searchForm.categoryId = undefined
  searchForm.tagId = undefined
  searchForm.ledgerId = undefined
  searchForm.accountId = undefined
  pagination.current = 1
  selectedRowKeys.value = []
  void loadRecords()
}

const handleTableChange = (tablePagination: TablePaginationConfig) => {
  pagination.current = tablePagination.current || 1
  pagination.pageSize = tablePagination.pageSize || 20
  selectedRowKeys.value = []
  void loadRecords()
}

const openRecord = (record: ImportRecord) => {
  editingRecordId.value = record.id
  recordDrawerVisible.value = true
}

const openMatch = (record: ImportRecord) => {
  matchingRecord.value = record
  matchModalVisible.value = true
}

const openChangedComparison = (record: ImportRecord) => {
  changedRecord.value = record
  changedDrawerVisible.value = true
}

const openRawData = (rawData: unknown) => {
  activeRawData.value = rawData
  rawDataVisible.value = true
}

const openBatchModal = (mode: BatchMode) => {
  if (!selectedCount.value) {
    message.warning('请先选择导入记录')
    return
  }
  batchMode.value = mode
  batchModalVisible.value = true
}

const handleApplyChange = async (record: ImportRecord) => {
  try {
    await updateImportDecisionApi(record.id, 'APPLY_CHANGE')
    message.success('已选择应用平台变化')
    changedDrawerVisible.value = false
    await refresh()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '保存处理决定失败')
  }
}

const handleCreateNew = async (record: ImportRecord) => {
  try {
    await updateImportDecisionApi(record.id, 'CREATE_NEW')
    message.success('已取消自动匹配，将创建新账单')
    await refresh()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '保存处理决定失败')
  }
}

const handleIgnore = async (record: ImportRecord) => {
  try {
    await ignoreImportRecordApi(record.id)
    message.success('已忽略该记录')
    await refresh()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '忽略记录失败')
  }
}

const handleRestore = async (record: ImportRecord) => {
  try {
    await restoreImportRecordApi(record.id)
    message.success('记录已恢复')
    await refresh()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '恢复记录失败')
  }
}

const handleBatchIgnore = async () => {
  if (!selectedCount.value) return
  try {
    await batchIgnoreImportRecordsApi(selectedRowKeys.value)
    message.success(`已忽略 ${selectedCount.value} 条记录`)
    await refresh()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '批量忽略失败')
  }
}

const handleBatchRestore = async () => {
  if (!selectedCount.value) return
  try {
    const result = await batchRestoreImportRecordsApi(selectedRowKeys.value)
    message.success(`已恢复 ${result.restored || 0} 条记录，${result.errors || 0} 条仍为错误`)
    await refresh()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '批量恢复失败')
  }
}

const getBlockerDetail = (error: ApiError): string => {
  const possible = Number(error.data.pendingPossibleMatches || 0)
  const changed = Number(error.data.pendingChanges || 0)
  const unsupported = Number(error.data.unsupported || 0)
  const errors = Number(error.data.errors || 0)
  const incomplete = Number(error.data.incomplete || 0)
  return `待匹配 ${possible} 条，有变化待决定 ${changed} 条，暂不支持 ${unsupported} 条，错误 ${errors} 条，其他未完成 ${incomplete} 条。`
}

const showBlockerModal = (error: ApiError) => {
  const possible = Number(error.data.pendingPossibleMatches || 0)
  const changed = Number(error.data.pendingChanges || 0)
  const unsupported = Number(error.data.unsupported || 0)
  const errors = Number(error.data.errors || 0)
  const targetReconcileStatus: ImportReconcileStatus | undefined = possible
    ? 'POSSIBLE_MATCH'
    : changed
      ? 'CHANGED'
      : unsupported
        ? 'UNSUPPORTED'
        : undefined
  const targetStatus: ImportRecordStatus | undefined = errors ? 'ERROR' : undefined

  Modal.confirm({
    title: '还有未处理记录',
    content: getBlockerDetail(error),
    okText: targetReconcileStatus || targetStatus ? '筛选待处理记录' : '知道了',
    cancelText: '关闭',
    onOk: () => {
      searchForm.reconcileStatus = targetReconcileStatus
      searchForm.status = targetStatus
      pagination.current = 1
      void loadRecords()
    },
  })
}

const handleConfirm = () => {
  Modal.confirm({
    title: '确认导入全部已处理记录？',
    content: '确认过程为一次事务：任一记录失败时不会写入部分结果。',
    okText: '确认导入',
    cancelText: '继续检查',
    onOk: async () => {
      try {
        confirming.value = true
        const result = await confirmImportTaskApi(taskId.value)
        await refresh()
        Modal.success({
          title: '导入完成',
          content: `新建 ${result.created}，关联 ${result.linked}，更新来源 ${result.updated}，无变化 ${result.unchanged}，忽略 ${result.ignored}。`,
          okText: '查看账单',
          onOk: () => router.push('/transactions'),
        })
      } catch (error) {
        console.error(error)
        if (error instanceof ApiError) {
          showBlockerModal(error)
        } else {
          message.error('确认导入失败')
        }
      } finally {
        confirming.value = false
      }
    },
  })
}

const formatAmount = (record: ImportRecord): string => {
  if (!record.amount) return '—'
  return `${record.type === 'EXPENSE' ? '-' : '+'} ¥${record.amount}`
}

onMounted(() => {
  void Promise.all([loadTask(), loadRecords(), loadOptions()])
})
</script>

<template>
  <section class="page-wrapper">
    <header class="page-header">
      <div>
        <a-button type="link" class="back-button" @click="router.push('/imports')">
          ← 返回导入任务
        </a-button>
        <h1>{{ task?.fileName || '导入预览' }}</h1>
        <p v-if="task">
          {{ transactionSourceLabels[task.source] }} ·
          {{ dayjs(task.createdAt).format('YYYY-MM-DD HH:mm:ss') }} · 共 {{ task.totalCount }} 条 ·
          任务状态 {{ task.status }}
        </p>
      </div>
      <a-button v-if="isPreview" type="primary" :loading="confirming" @click="handleConfirm">
        确认导入
      </a-button>
    </header>

    <a-alert
      v-if="task?.status === 'COMPLETED'"
      class="page-alert"
      type="success"
      show-icon
      message="该任务已经完成，当前页面仅供查看。"
    />
    <a-alert
      v-else-if="task?.status === 'FAILED'"
      class="page-alert"
      type="error"
      show-icon
      :message="task.errorMessage || '任务解析失败'"
    />
    <a-alert
      v-else
      class="page-alert"
      type="info"
      show-icon
      message="先处理疑似匹配、有变化、暂不支持和错误记录，再确认导入。"
      description="关联已有账单或自动匹配只新增来源记录，不会覆盖已有账单的分类、标签、账本、账户和备注。"
    />

    <section class="summary-grid">
      <div v-for="item in summaryItems" :key="item.label" class="summary-item">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </div>
    </section>

    <section class="search-container">
      <a-form :model="searchForm" layout="inline">
        <a-form-item label="关键词">
          <a-input
            v-model:value="searchForm.keyword"
            placeholder="商户、说明、备注、订单号"
            allow-clear
            style="width: 240px"
            @press-enter="handleSearch"
          />
        </a-form-item>
        <a-form-item label="记录状态">
          <a-select
            v-model:value="searchForm.status"
            :options="statusOptions"
            style="width: 120px"
          />
        </a-form-item>
        <a-form-item label="对账结果">
          <a-select
            v-model:value="searchForm.reconcileStatus"
            :options="reconcileOptions"
            style="width: 130px"
          />
        </a-form-item>
        <a-form-item label="分类">
          <a-select
            v-model:value="searchForm.categoryId"
            :options="categoryOptions"
            :loading="optionsLoading"
            allow-clear
            style="width: 130px"
          />
        </a-form-item>
        <a-form-item label="标签">
          <a-select
            v-model:value="searchForm.tagId"
            :options="tagOptions"
            :loading="optionsLoading"
            allow-clear
            style="width: 130px"
          />
        </a-form-item>
        <a-form-item label="账本">
          <a-select
            v-model:value="searchForm.ledgerId"
            :options="ledgerOptions"
            :loading="optionsLoading"
            allow-clear
            style="width: 130px"
          />
        </a-form-item>
        <a-form-item label="账户">
          <a-select
            v-model:value="searchForm.accountId"
            :options="accountOptions"
            :loading="optionsLoading"
            allow-clear
            style="width: 130px"
          />
        </a-form-item>
        <a-form-item>
          <a-space>
            <a-button type="primary" @click="handleSearch">查询</a-button>
            <a-button @click="handleReset">重置</a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </section>

    <section v-if="isPreview" class="batch-toolbar">
      <span>已选 {{ selectedCount }} 条</span>
      <a-button :disabled="!selectedCount" @click="openBatchModal('CATEGORY')">设置分类</a-button>
      <a-button :disabled="!selectedCount" @click="openBatchModal('TAG')">整理标签</a-button>
      <a-button :disabled="!selectedCount" @click="openBatchModal('LEDGER')">设置账本</a-button>
      <a-button :disabled="!selectedCount" @click="openBatchModal('ACCOUNT')">设置账户</a-button>
      <a-button :disabled="!selectedCount" @click="handleBatchIgnore">批量忽略</a-button>
      <a-button :disabled="!selectedCount" @click="handleBatchRestore">批量恢复</a-button>
    </section>

    <a-table
      row-key="id"
      :columns="columns"
      :data-source="tableData"
      :loading="loading"
      :pagination="paginationConfig"
      :row-selection="isPreview ? rowSelection : undefined"
      :scroll="{ x: 2600 }"
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }: { column: { key?: string }; record: ImportRecord }">
        <template v-if="column.key === 'status'">
          <a-tag>{{ statusLabels[record.status] }}</a-tag>
        </template>
        <template v-else-if="column.key === 'transactionTime'">
          {{
            record.transactionTime
              ? dayjs(record.transactionTime).format('YYYY-MM-DD HH:mm:ss')
              : '—'
          }}
        </template>
        <template v-else-if="column.key === 'type'">
          {{ record.type === 'EXPENSE' ? '支出' : record.type === 'INCOME' ? '收入' : '—' }}
        </template>
        <template v-else-if="column.key === 'sourceAmount'">
          ¥{{ record.sourceAmount || '—' }}
        </template>
        <template v-else-if="column.key === 'amount'">
          <span :class="record.type === 'EXPENSE' ? 'expense-amount' : 'income-amount'">
            {{ formatAmount(record) }}
          </span>
        </template>
        <template v-else-if="column.key === 'summary'">
          <div>{{ record.merchant || '—' }}</div>
          <div class="secondary-text">{{ record.description || '—' }}</div>
        </template>
        <template v-else-if="column.key === 'category'">{{
          record.category?.name || '—'
        }}</template>
        <template v-else-if="column.key === 'tags'">
          <a-tag v-for="tag in record.tags" :key="tag.id">{{ tag.name }}</a-tag>
          <span v-if="!record.tags.length">—</span>
        </template>
        <template v-else-if="column.key === 'account'">{{ record.account?.name || '—' }}</template>
        <template v-else-if="column.key === 'ledger'">{{ record.ledger?.name || '—' }}</template>
        <template v-else-if="column.key === 'sourceFact'">
          <div>
            {{ transactionSourceLabels[record.source] }} · {{ record.sourceRecordKind || '—' }}
          </div>
          <div class="secondary-text">状态：{{ record.sourceStatus || '—' }}</div>
          <div class="secondary-text">
            分类：{{ record.sourceCategory || '—' }} ·
            {{ record.paymentMethod || '未匹配支付方式' }}
          </div>
        </template>
        <template v-else-if="column.key === 'reconcileStatus'">
          <a-tooltip :title="record.reconcileReason || undefined">
            <a-tag v-if="record.reconcileStatus" :color="reconcileColors[record.reconcileStatus]">
              {{ reconcileLabels[record.reconcileStatus] }}
            </a-tag>
            <span v-else>—</span>
          </a-tooltip>
          <div v-if="record.parserWarnings.length" class="warning-text">
            {{ record.parserWarnings.join('；') }}
          </div>
        </template>
        <template v-else-if="column.key === 'decision'">
          {{ decisionLabels[record.decision] }}
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="0">
            <a-button type="link" @click="openRecord(record)">查看 / 整理</a-button>
            <a-button
              v-if="isPreview && record.reconcileStatus === 'POSSIBLE_MATCH'"
              type="link"
              @click="openMatch(record)"
            >
              选择匹配
            </a-button>
            <a-button
              v-if="
                isPreview &&
                record.reconcileStatus === 'AUTO_MATCH' &&
                record.decision !== 'CREATE_NEW'
              "
              type="link"
              @click="handleCreateNew(record)"
            >
              改为新账单
            </a-button>
            <a-button
              v-if="isPreview && record.reconcileStatus === 'CHANGED'"
              type="link"
              @click="openChangedComparison(record)"
            >
              查看变化
            </a-button>
            <a-button
              v-if="isPreview && record.status !== 'IGNORED'"
              type="link"
              danger
              @click="handleIgnore(record)"
            >
              忽略
            </a-button>
            <a-button
              v-if="isPreview && record.status === 'IGNORED'"
              type="link"
              @click="handleRestore(record)"
            >
              恢复
            </a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <ImportRecordDrawer
      v-model:visible="recordDrawerVisible"
      :record-id="editingRecordId"
      :readonly="!isPreview"
      :ledgers="ledgers"
      :categories="categories"
      :accounts="accounts"
      :tags="tags"
      @success="refresh"
      @show-raw="openRawData"
    />
    <PossibleMatchModal
      v-model:visible="matchModalVisible"
      :record="matchingRecord"
      @success="refresh"
    />
    <ChangedComparisonDrawer
      v-model:visible="changedDrawerVisible"
      :record="changedRecord"
      @apply="handleApplyChange"
      @ignore="handleIgnore"
      @show-raw="openRawData"
    />
    <BatchUpdateModal
      v-model:visible="batchModalVisible"
      :mode="batchMode"
      :record-ids="selectedRowKeys"
      :ledgers="ledgers"
      :categories="categories"
      :accounts="accounts"
      :tags="tags"
      @success="refresh"
    />
    <RawDataModal v-model:visible="rawDataVisible" :raw-data="activeRawData" />
  </section>
</template>

<style scoped lang="less">
.page-wrapper {
  padding: 24px;
  background: #fff;
  border-radius: 8px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;

  h1 {
    margin: 2px 0 6px;
  }

  p {
    margin: 0;
    color: #8c8c8c;
  }
}

.back-button {
  height: auto;
  padding: 0;
}

.page-alert {
  margin-bottom: 16px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(90px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.summary-item {
  padding: 12px;
  text-align: center;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 6px;

  span,
  strong {
    display: block;
  }

  span {
    color: #8c8c8c;
    font-size: 12px;
  }

  strong {
    margin-top: 4px;
    font-size: 20px;
  }
}

.search-container {
  padding: 16px;
  margin-bottom: 12px;
  background: #fafafa;
  border-radius: 6px;
}

.batch-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: #f0f5ff;
  border: 1px solid #adc6ff;
  border-radius: 6px;
}

.secondary-text {
  margin-top: 2px;
  overflow: hidden;
  color: #8c8c8c;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.warning-text {
  margin-top: 4px;
  color: #cf1322;
  font-size: 12px;
  white-space: normal;
}

.expense-amount {
  color: #cf1322;
}

.income-amount {
  color: #389e0d;
}
</style>
