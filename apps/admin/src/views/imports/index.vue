<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue'
import dayjs from 'dayjs'
import { useRouter } from 'vue-router'

import {
  getImportTasksApi,
  uploadImportApi,
  type ImportTask,
  type ImportTaskStatus,
} from '@/api/import'
import { ApiError } from '@/api/request'
import {
  transactionSourceLabels,
  transactionSourceOptions,
  type TransactionSource,
} from '@/api/transaction'

interface SearchForm {
  status: ImportTaskStatus | undefined
  source: TransactionSource | undefined
}

interface PaginationState {
  current: number
  pageSize: number
  total: number
}

const router = useRouter()

const loading = ref(false)
const uploading = ref(false)
const fileInputRef = ref<HTMLInputElement>()
const tableData = ref<ImportTask[]>([])
const searchForm = reactive<SearchForm>({ status: undefined, source: undefined })
const pagination = reactive<PaginationState>({ current: 1, pageSize: 20, total: 0 })

const columns: TableColumnsType<ImportTask> = [
  { title: '文件', dataIndex: 'fileName', key: 'fileName', width: 260 },
  { title: '平台', dataIndex: 'source', key: 'source', width: 100 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 110 },
  { title: '记录概览', key: 'summary', width: 620 },
  { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
  { title: '操作', key: 'action', width: 110, fixed: 'right' },
]

const taskStatusOptions = [
  { label: '全部', value: undefined },
  { label: '解析中', value: 'PARSING' },
  { label: '待确认', value: 'PREVIEW' },
  { label: '导入中', value: 'IMPORTING' },
  { label: '已完成', value: 'COMPLETED' },
  { label: '失败', value: 'FAILED' },
]

const paginationConfig = computed(() => ({
  current: pagination.current,
  pageSize: pagination.pageSize,
  total: pagination.total,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 个任务`,
}))

const taskStatusLabels: Record<ImportTaskStatus, string> = {
  PENDING: '等待中',
  PARSING: '解析中',
  PREVIEW: '待确认',
  IMPORTING: '导入中',
  COMPLETED: '已完成',
  FAILED: '失败',
}

const taskStatusColors: Record<ImportTaskStatus, string> = {
  PENDING: 'default',
  PARSING: 'processing',
  PREVIEW: 'warning',
  IMPORTING: 'processing',
  COMPLETED: 'success',
  FAILED: 'error',
}

const getTaskList = async () => {
  try {
    loading.value = true
    const result = await getImportTasksApi({
      status: searchForm.status,
      source: searchForm.source,
      page: pagination.current,
      pageSize: pagination.pageSize,
    })
    tableData.value = result.items
    pagination.total = result.total
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '获取导入任务失败')
  } finally {
    loading.value = false
  }
}

const handleUploadClick = () => fileInputRef.value?.click()

const handleFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    uploading.value = true
    const task = await uploadImportApi(file)
    if (task.status === 'FAILED') {
      message.error(task.errorMessage || '文件解析失败')
      await getTaskList()
      return
    }
    message.success('文件解析完成，请检查预览记录')
    await router.push(`/imports/${task.id}`)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '上传账单失败')
  } finally {
    uploading.value = false
  }
}

const handleSearch = () => {
  pagination.current = 1
  void getTaskList()
}

const handleReset = () => {
  searchForm.status = undefined
  searchForm.source = undefined
  pagination.current = 1
  void getTaskList()
}

const handleTableChange = (tablePagination: TablePaginationConfig) => {
  pagination.current = tablePagination.current || 1
  pagination.pageSize = tablePagination.pageSize || 20
  void getTaskList()
}

const openTask = (task: ImportTask) => void router.push(`/imports/${task.id}`)

const getSummary = (task: ImportTask): string => {
  const count = (key: keyof ImportTask['reconcileCounts']): number => task.reconcileCounts[key] || 0
  return [
    `共 ${task.totalCount} 条`,
    `新增 ${count('NEW')}`,
    `无变化 ${count('UNCHANGED')}`,
    `有变化 ${count('CHANGED')}`,
    `自动匹配 ${count('AUTO_MATCH')}`,
    `待确认 ${count('POSSIBLE_MATCH')}`,
    `未支持 ${count('UNSUPPORTED')}`,
    `已忽略 ${task.statusCounts.IGNORED || 0}`,
    `已导入 ${task.statusCounts.IMPORTED || 0}`,
  ].join(' · ')
}

onMounted(() => void getTaskList())
</script>

<template>
  <section class="page-wrapper">
    <header class="page-header">
      <div>
        <h1>账单导入</h1>
        <p>上传平台账单，逐条核对后再一次性确认写入。</p>
      </div>
      <div>
        <input
          ref="fileInputRef"
          class="file-input"
          type="file"
          accept=".csv,.xlsx"
          @change="handleFileChange"
        />
        <a-button type="primary" :loading="uploading" @click="handleUploadClick">
          上传账单文件
        </a-button>
      </div>
    </header>

    <a-alert
      class="upload-hint"
      type="info"
      show-icon
      message="支持支付宝、京东 CSV（含 GB18030）及微信支付 XLSX，单个文件最多 10 MB。"
    />

    <section class="search-container">
      <a-form :model="searchForm" layout="inline">
        <a-form-item label="任务状态">
          <a-select
            v-model:value="searchForm.status"
            :options="taskStatusOptions"
            style="width: 130px"
          />
        </a-form-item>
        <a-form-item label="来源平台">
          <a-select
            v-model:value="searchForm.source"
            :options="[{ label: '全部', value: undefined }, ...transactionSourceOptions]"
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

    <a-table
      row-key="id"
      :columns="columns"
      :data-source="tableData"
      :loading="loading"
      :pagination="paginationConfig"
      :scroll="{ x: 1380 }"
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }: { column: { key?: string }; record: ImportTask }">
        <template v-if="column.key === 'fileName'">
          <div class="file-name">{{ record.fileName }}</div>
          <div v-if="record.errorMessage" class="error-text">{{ record.errorMessage }}</div>
        </template>
        <template v-else-if="column.key === 'source'">
          {{ transactionSourceLabels[record.source] }}
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="taskStatusColors[record.status]">
            {{ taskStatusLabels[record.status] }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'summary'">
          {{ getSummary(record) }}
        </template>
        <template v-else-if="column.key === 'createdAt'">
          {{ dayjs(record.createdAt).format('YYYY-MM-DD HH:mm:ss') }}
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button type="link" @click="openTask(record)">
            {{ record.status === 'PREVIEW' ? '继续处理' : '查看' }}
          </a-button>
        </template>
      </template>
    </a-table>
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
  margin-bottom: 20px;

  h1 {
    margin: 0 0 6px;
  }

  p {
    margin: 0;
    color: #8c8c8c;
  }
}

.file-input {
  display: none;
}

.upload-hint {
  margin-bottom: 16px;
}

.search-container {
  padding: 16px;
  margin-bottom: 16px;
  background: #fafafa;
  border-radius: 6px;
}

.file-name {
  font-weight: 500;
}

.error-text {
  margin-top: 4px;
  color: #ff4d4f;
  font-size: 12px;
}
</style>
