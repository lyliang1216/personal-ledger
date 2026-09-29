<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'

import { deleteLedgerApi, getLedgersApi, setDefaultLedgerApi, type Ledger } from '@/api/ledger'
import { ApiError } from '@/api/request'

import LedgerFormModal from './components/LedgerFormModal.vue'

const loading = ref(false)
const tableData = ref<Ledger[]>([])
const modalVisible = ref(false)
const editingLedger = ref<Ledger | null>(null)

const columns: TableColumnsType = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '描述', dataIndex: 'description', key: 'description' },
  { title: '默认账本', dataIndex: 'isDefault', key: 'isDefault', width: 110 },
  { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 190 },
  { title: '操作', key: 'action', width: 230 },
]

const formatDateTime = (value: string): string => {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

const getLedgerList = async () => {
  try {
    loading.value = true
    tableData.value = await getLedgersApi()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '获取账本失败')
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  editingLedger.value = null
  modalVisible.value = true
}

const handleEdit = (record: Ledger) => {
  editingLedger.value = record
  modalVisible.value = true
}

const handleSetDefault = async (record: Ledger) => {
  try {
    await setDefaultLedgerApi(record.id)
    message.success('默认账本设置成功')
    await getLedgerList()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '设置默认账本失败')
  }
}

const handleDelete = async (record: Ledger) => {
  try {
    await deleteLedgerApi(record.id)
    message.success('账本删除成功')
    await getLedgerList()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '账本删除失败')
  }
}

onMounted(() => {
  getLedgerList()
})
</script>

<template>
  <section class="page-wrapper">
    <header class="page-header">
      <div>
        <h1>账本管理</h1>
        <p>账本用于隔离不同统计空间，每位用户始终保留一个默认账本。</p>
      </div>
      <a-button type="primary" @click="handleCreate">新增账本</a-button>
    </header>

    <a-table
      :columns="columns"
      :data-source="tableData"
      :loading="loading"
      :pagination="false"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'description'">
          {{ record.description || '-' }}
        </template>
        <template v-else-if="column.key === 'isDefault'">
          <a-tag :color="record.isDefault ? 'green' : 'default'">
            {{ record.isDefault ? '默认' : '普通' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'createdAt'">
          {{ formatDateTime(record.createdAt) }}
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space>
            <a-button type="link" size="small" @click="handleEdit(record)">编辑</a-button>
            <a-button
              v-if="!record.isDefault"
              type="link"
              size="small"
              @click="handleSetDefault(record)"
            >
              设为默认
            </a-button>
            <a-popconfirm
              v-if="!record.isDefault"
              title="确认删除这个账本吗？"
              @confirm="handleDelete(record)"
            >
              <a-button type="link" danger size="small">删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <LedgerFormModal
      v-model:visible="modalVisible"
      :ledger="editingLedger"
      @success="getLedgerList"
    />
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
    margin: 0 0 4px;
    font-size: 22px;
  }

  p {
    margin: 0;
    color: #8c8c8c;
  }
}
</style>
