<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue'
import dayjs, { type Dayjs } from 'dayjs'

import { getAccountsApi, type Account } from '@/api/account'
import { getCategoriesApi, type Category, type TransactionType } from '@/api/category'
import { getLedgersApi, type Ledger } from '@/api/ledger'
import { ApiError } from '@/api/request'
import { getTagsApi, type LedgerTag } from '@/api/tag'
import {
  batchDeleteTransactionsApi,
  deleteTransactionApi,
  getTransactionsApi,
  transactionSourceLabels,
  transactionSourceOptions,
  type TransactionItem,
  type TransactionQuery,
  type TransactionSource,
} from '@/api/transaction'

import BatchCategoryModal from './components/BatchCategoryModal.vue'
import BatchLedgerModal from './components/BatchLedgerModal.vue'
import BatchTagModal from './components/BatchTagModal.vue'
import TransactionFormDrawer from './components/TransactionFormDrawer.vue'

interface SearchForm {
  dateRange: [Dayjs, Dayjs] | undefined
  keyword: string
  type: TransactionType | undefined
  ledgerId: string | undefined
  categoryId: string | undefined
  tagId: string | undefined
  accountId: string | undefined
  source: TransactionSource | undefined
}

interface PaginationState {
  current: number
  pageSize: number
  total: number
}

const loading = ref(false)
const optionsLoading = ref(false)
const tableData = ref<TransactionItem[]>([])
const ledgers = ref<Ledger[]>([])
const categories = ref<Category[]>([])
const tags = ref<LedgerTag[]>([])
const accounts = ref<Account[]>([])
const selectedRowKeys = ref<string[]>([])
const formDrawerVisible = ref(false)
const editingTransactionId = ref<string | null>(null)
const batchCategoryVisible = ref(false)
const batchTagVisible = ref(false)
const batchLedgerVisible = ref(false)
const searchForm = reactive<SearchForm>({
  dateRange: undefined,
  keyword: '',
  type: undefined,
  ledgerId: undefined,
  categoryId: undefined,
  tagId: undefined,
  accountId: undefined,
  source: undefined,
})
const pagination = reactive<PaginationState>({
  current: 1,
  pageSize: 20,
  total: 0,
})

const columns: TableColumnsType<TransactionItem> = [
  { title: '交易时间', dataIndex: 'transactionTime', key: 'transactionTime', width: 170 },
  { title: '类型', dataIndex: 'type', key: 'type', width: 80 },
  { title: '金额', dataIndex: 'amount', key: 'amount', width: 130, align: 'right' },
  { title: '商户 / 交易说明', key: 'summary', width: 220 },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 180 },
  { title: '分类', dataIndex: 'category', key: 'category', width: 120 },
  { title: '标签', dataIndex: 'tags', key: 'tags', width: 180 },
  { title: '账户', dataIndex: 'account', key: 'account', width: 120 },
  { title: '账本', dataIndex: 'ledger', key: 'ledger', width: 120 },
  { title: '来源', dataIndex: 'source', key: 'source', width: 90 },
  { title: '操作', key: 'action', width: 120, fixed: 'right' },
]

const typeOptions = [
  { label: '全部', value: undefined },
  { label: '支出', value: 'EXPENSE' },
  { label: '收入', value: 'INCOME' },
]
const ledgerOptions = computed(() =>
  ledgers.value.map((item) => ({ label: item.name, value: item.id })),
)
const categoryOptions = computed(() =>
  categories.value
    .filter((item) => !searchForm.type || item.type === searchForm.type)
    .map((item) => ({ label: item.parentId ? `↳ ${item.name}` : item.name, value: item.id })),
)
const tagOptions = computed(() => tags.value.map((item) => ({ label: item.name, value: item.id })))
const accountOptions = computed(() =>
  accounts.value.map((item) => ({ label: item.name, value: item.id })),
)
const selectedCount = computed(() => selectedRowKeys.value.length)
const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: (string | number)[]) => {
    selectedRowKeys.value = keys.map(String)
  },
}))
const selectedTransactionType = computed<TransactionType | undefined>(() => {
  const selectedItems = tableData.value.filter((item) => selectedRowKeys.value.includes(item.id))
  const selectedTypes = new Set(selectedItems.map((item) => item.type))
  return selectedItems.length === selectedCount.value && selectedTypes.size === 1
    ? selectedItems[0]?.type
    : undefined
})
const queryParams = computed<TransactionQuery>(() => ({
  startDate: searchForm.dateRange?.[0].startOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
  endDate: searchForm.dateRange?.[1].endOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
  type: searchForm.type,
  ledgerId: searchForm.ledgerId,
  categoryId: searchForm.categoryId,
  tagId: searchForm.tagId,
  accountId: searchForm.accountId,
  source: searchForm.source,
  keyword: searchForm.keyword.trim() || undefined,
  page: pagination.current,
  pageSize: pagination.pageSize,
}))

const getTransactionList = async () => {
  try {
    loading.value = true
    const result = await getTransactionsApi(queryParams.value)
    tableData.value = result.items
    pagination.total = result.total
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '获取账单失败')
  } finally {
    loading.value = false
  }
}

const getFilterOptions = async () => {
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
    message.error(error instanceof ApiError ? error.message : '获取筛选项失败')
  } finally {
    optionsLoading.value = false
  }
}

const clearSelection = () => {
  selectedRowKeys.value = []
}

const refreshAfterWrite = async () => {
  clearSelection()
  await getTransactionList()
}

const handleSearch = () => {
  pagination.current = 1
  clearSelection()
  getTransactionList()
}

const handleReset = () => {
  searchForm.dateRange = undefined
  searchForm.keyword = ''
  searchForm.type = undefined
  searchForm.ledgerId = undefined
  searchForm.categoryId = undefined
  searchForm.tagId = undefined
  searchForm.accountId = undefined
  searchForm.source = undefined
  pagination.current = 1
  clearSelection()
  getTransactionList()
}

const handleTableChange = (tablePagination: TablePaginationConfig) => {
  pagination.current = tablePagination.current || 1
  pagination.pageSize = tablePagination.pageSize || 20
  clearSelection()
  getTransactionList()
}

const handleTypeChange = () => {
  if (!categoryOptions.value.some((item) => item.value === searchForm.categoryId)) {
    searchForm.categoryId = undefined
  }
}

const handleCreate = () => {
  editingTransactionId.value = null
  formDrawerVisible.value = true
}

const handleEdit = (record: TransactionItem) => {
  editingTransactionId.value = record.id
  formDrawerVisible.value = true
}

const handleDelete = async (record: TransactionItem) => {
  try {
    await deleteTransactionApi(record.id)
    message.success('账单删除成功')
    if (tableData.value.length === 1 && pagination.current > 1) pagination.current -= 1
    await refreshAfterWrite()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '账单删除失败')
  }
}

const handleBatchDelete = () => {
  Modal.confirm({
    title: `确认删除选中的 ${selectedCount.value} 条账单？`,
    content: '删除后无法恢复。',
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        const result = await batchDeleteTransactionsApi(selectedRowKeys.value)
        message.success(`已删除 ${result.count} 条账单`)
        await refreshAfterWrite()
      } catch (error) {
        console.error(error)
        message.error(error instanceof ApiError ? error.message : '批量删除失败')
        throw error
      }
    },
  })
}

const handleOpenBatchCategory = () => {
  if (!selectedTransactionType.value) {
    message.warning('批量修改分类时请选择相同收支类型的账单')
    return
  }

  batchCategoryVisible.value = true
}

const formatAmount = (record: TransactionItem): string => {
  const [integerPart, originalFraction = ''] = record.amount.split('.')
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  let fraction = originalFraction.padEnd(2, '0')
  while (fraction.length > 2 && fraction.endsWith('0')) fraction = fraction.slice(0, -1)
  const sign = record.type === 'EXPENSE' ? '-' : '+'
  return `${sign} ¥${groupedInteger}.${fraction}`
}

const formatTransactionTime = (value: string): string => dayjs(value).format('YYYY-MM-DD HH:mm:ss')

const getSourceLabel = (source: TransactionSource): string => transactionSourceLabels[source]

const getSourceTypes = (record: TransactionItem): TransactionSource[] => {
  return [...new Set(record.sources.map((item) => item.source))]
}

onMounted(() => {
  getFilterOptions()
  getTransactionList()
})
</script>

<template>
  <section class="page-wrapper">
    <header class="page-header">
      <div>
        <h1>账单明细</h1>
        <p>查询、维护和批量整理当前账号下的账单。</p>
      </div>
      <a-button type="primary" @click="handleCreate">新增账单</a-button>
    </header>

    <section class="search-container">
      <a-form :model="searchForm" layout="inline">
        <a-form-item label="日期范围">
          <a-range-picker v-model:value="searchForm.dateRange" />
        </a-form-item>
        <a-form-item label="关键词">
          <a-input
            v-model:value="searchForm.keyword"
            placeholder="搜索备注、商户、交易说明、订单号"
            allow-clear
            style="width: 280px"
            @press-enter="handleSearch"
          />
        </a-form-item>
        <a-form-item label="收支类型">
          <a-select
            v-model:value="searchForm.type"
            :options="typeOptions"
            style="width: 110px"
            @change="handleTypeChange"
          />
        </a-form-item>
        <a-form-item label="账本">
          <a-select
            v-model:value="searchForm.ledgerId"
            :options="ledgerOptions"
            :loading="optionsLoading"
            allow-clear
            style="width: 140px"
          />
        </a-form-item>
        <a-form-item label="分类">
          <a-select
            v-model:value="searchForm.categoryId"
            :options="categoryOptions"
            :loading="optionsLoading"
            allow-clear
            show-search
            option-filter-prop="label"
            style="width: 140px"
          />
        </a-form-item>
        <a-form-item label="标签">
          <a-select
            v-model:value="searchForm.tagId"
            :options="tagOptions"
            :loading="optionsLoading"
            allow-clear
            show-search
            option-filter-prop="label"
            style="width: 140px"
          />
        </a-form-item>
        <a-form-item label="账户">
          <a-select
            v-model:value="searchForm.accountId"
            :options="accountOptions"
            :loading="optionsLoading"
            allow-clear
            style="width: 140px"
          />
        </a-form-item>
        <a-form-item label="来源">
          <a-select
            v-model:value="searchForm.source"
            :options="transactionSourceOptions"
            allow-clear
            style="width: 120px"
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

    <section class="table-container">
      <div class="batch-toolbar">
        <span>已选择 {{ selectedCount }} 项</span>
        <a-space>
          <a-button :disabled="!selectedCount" danger @click="handleBatchDelete">批量删除</a-button>
          <a-button :disabled="!selectedCount" @click="handleOpenBatchCategory">修改分类</a-button>
          <a-button :disabled="!selectedCount" @click="batchTagVisible = true">修改标签</a-button>
          <a-button :disabled="!selectedCount" @click="batchLedgerVisible = true">
            移动账本
          </a-button>
        </a-space>
      </div>

      <a-table
        :columns="columns"
        :data-source="tableData"
        :loading="loading"
        :pagination="{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showTotal: (total: number) => `共 ${total} 条`,
        }"
        :row-selection="rowSelection"
        :scroll="{ x: 1650 }"
        row-key="id"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'transactionTime'">
            {{ formatTransactionTime(record.transactionTime) }}
          </template>
          <template v-else-if="column.key === 'type'">
            <a-tag :color="record.type === 'EXPENSE' ? 'orange' : 'green'">
              {{ record.type === 'EXPENSE' ? '支出' : '收入' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'amount'">
            <span :class="['amount-text', record.type.toLowerCase()]">
              {{ formatAmount(record) }}
            </span>
          </template>
          <template v-else-if="column.key === 'summary'">
            <div class="summary-cell">
              <span>{{ record.merchant || '-' }}</span>
              <small>{{ record.description || '-' }}</small>
            </div>
          </template>
          <template v-else-if="column.key === 'remark'">{{ record.remark || '-' }}</template>
          <template v-else-if="column.key === 'category'">
            {{ record.category?.name || '-' }}
          </template>
          <template v-else-if="column.key === 'tags'">
            <a-space :size="4" wrap>
              <a-tag v-for="tag in record.tags.slice(0, 2)" :key="tag.id">{{ tag.name }}</a-tag>
              <a-tag v-if="record.tags.length > 2">+{{ record.tags.length - 2 }}</a-tag>
              <span v-if="!record.tags.length">-</span>
            </a-space>
          </template>
          <template v-else-if="column.key === 'account'">
            {{ record.account?.name || '-' }}
          </template>
          <template v-else-if="column.key === 'ledger'">{{ record.ledger.name }}</template>
          <template v-else-if="column.key === 'source'">
            <a-space :size="4" wrap>
              <a-tag v-for="source in getSourceTypes(record)" :key="source">
                {{ getSourceLabel(source) }}
              </a-tag>
              <span v-if="!record.sources.length">-</span>
            </a-space>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-popconfirm title="确认删除这条账单吗？" @confirm="handleDelete(record)">
                <a-button type="link" danger size="small">删除</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </section>

    <TransactionFormDrawer
      v-model:visible="formDrawerVisible"
      :transaction-id="editingTransactionId"
      :ledgers="ledgers"
      :categories="categories"
      :accounts="accounts"
      :tags="tags"
      @success="refreshAfterWrite"
    />
    <BatchCategoryModal
      v-model:visible="batchCategoryVisible"
      :transaction-ids="selectedRowKeys"
      :transaction-type="selectedTransactionType"
      :categories="categories"
      @success="refreshAfterWrite"
    />
    <BatchTagModal
      v-model:visible="batchTagVisible"
      :transaction-ids="selectedRowKeys"
      :tags="tags"
      @success="refreshAfterWrite"
    />
    <BatchLedgerModal
      v-model:visible="batchLedgerVisible"
      :transaction-ids="selectedRowKeys"
      :ledgers="ledgers"
      @success="refreshAfterWrite"
    />
  </section>
</template>

<style scoped lang="less">
.page-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header,
.search-container,
.table-container {
  padding: 20px 24px;
  background: #fff;
  border-radius: 8px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;

  h1 {
    margin: 0 0 4px;
    font-size: 22px;
  }

  p {
    margin: 0;
    color: #8c8c8c;
  }
}

.search-container :deep(.ant-form-item) {
  margin-bottom: 12px;
}

.batch-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  color: #595959;
}

.summary-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;

  small {
    overflow: hidden;
    color: #8c8c8c;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.amount-text {
  font-weight: 600;
  font-variant-numeric: tabular-nums;

  &.expense {
    color: #cf1322;
  }

  &.income {
    color: #389e0d;
  }
}
</style>
