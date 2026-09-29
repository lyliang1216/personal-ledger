<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'

import {
  deleteAccountApi,
  getAccountsApi,
  updateAccountApi,
  type Account,
  type AccountType,
} from '@/api/account'
import { ApiError } from '@/api/request'

import AccountFormModal from './components/AccountFormModal.vue'

const loading = ref(false)
const tableData = ref<Account[]>([])
const modalVisible = ref(false)
const editingAccount = ref<Account | null>(null)
const searchForm = reactive<{ isActive: boolean | undefined }>({ isActive: undefined })
const statusOptions = [
  { label: '全部', value: undefined },
  { label: '启用', value: true },
  { label: '停用', value: false },
]

const columns: TableColumnsType = [
  { title: '账户名称', dataIndex: 'name', key: 'name' },
  { title: '账户类型', dataIndex: 'type', key: 'type', width: 120 },
  { title: '描述', dataIndex: 'description', key: 'description' },
  { title: '状态', dataIndex: 'isActive', key: 'isActive', width: 90 },
  { title: '操作', key: 'action', width: 220 },
]

const accountTypeLabels: Record<AccountType, string> = {
  CASH: '现金',
  WECHAT: '微信',
  ALIPAY: '支付宝',
  BANK_CARD: '银行卡',
  CREDIT_CARD: '信用卡',
  JD: '京东',
  OTHER: '其他',
}

const getAccountTypeLabel = (type: AccountType): string => {
  return accountTypeLabels[type]
}

const getAccountList = async () => {
  try {
    loading.value = true
    tableData.value = await getAccountsApi(searchForm.isActive)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '获取账户失败')
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  editingAccount.value = null
  modalVisible.value = true
}

const handleEdit = (record: Account) => {
  editingAccount.value = record
  modalVisible.value = true
}

const handleToggleActive = async (record: Account) => {
  try {
    await updateAccountApi(record.id, { isActive: !record.isActive })
    message.success(record.isActive ? '账户已停用' : '账户已启用')
    await getAccountList()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '账户状态更新失败')
  }
}

const handleDelete = async (record: Account) => {
  try {
    await deleteAccountApi(record.id)
    message.success('账户删除成功')
    await getAccountList()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '账户删除失败')
  }
}

onMounted(() => {
  getAccountList()
})
</script>

<template>
  <section class="page-wrapper">
    <header class="page-header">
      <div>
        <h1>账户管理</h1>
        <p>停用仅影响后续账单选择，不影响任何历史数据。</p>
      </div>
      <a-button type="primary" @click="handleCreate">新增账户</a-button>
    </header>

    <a-form class="search-container" :model="searchForm" layout="inline">
      <a-form-item label="状态">
        <a-select
          v-model:value="searchForm.isActive"
          :options="statusOptions"
          style="width: 140px"
          @change="getAccountList"
        />
      </a-form-item>
    </a-form>

    <a-table
      :columns="columns"
      :data-source="tableData"
      :loading="loading"
      :pagination="false"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'type'">{{ getAccountTypeLabel(record.type) }}</template>
        <template v-else-if="column.key === 'description'">{{
          record.description || '-'
        }}</template>
        <template v-else-if="column.key === 'isActive'">
          <a-tag :color="record.isActive ? 'green' : 'default'">
            {{ record.isActive ? '启用' : '停用' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space>
            <a-button type="link" size="small" @click="handleEdit(record)">编辑</a-button>
            <a-button type="link" size="small" @click="handleToggleActive(record)">
              {{ record.isActive ? '停用' : '启用' }}
            </a-button>
            <a-popconfirm title="确认删除这个账户吗？" @confirm="handleDelete(record)">
              <a-button type="link" danger size="small">删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <AccountFormModal
      v-model:visible="modalVisible"
      :account="editingAccount"
      @success="getAccountList"
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

.search-container {
  margin-bottom: 16px;
  padding: 16px;
  background: #fafafa;
  border-radius: 6px;
}
</style>
