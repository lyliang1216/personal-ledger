<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'

import { ApiError } from '@/api/request'
import { deleteTagApi, getTagsApi, type LedgerTag } from '@/api/tag'

import TagFormModal from './components/TagFormModal.vue'

const loading = ref(false)
const tableData = ref<LedgerTag[]>([])
const modalVisible = ref(false)
const editingTag = ref<LedgerTag | null>(null)
const searchForm = reactive({ keyword: '' })

const columns: TableColumnsType = [
  { title: '标签名称', dataIndex: 'name', key: 'name' },
  { title: '描述', dataIndex: 'description', key: 'description' },
  { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 190 },
  { title: '操作', key: 'action', width: 140 },
]

const formatDateTime = (value: string): string => {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

const getTagList = async () => {
  try {
    loading.value = true
    tableData.value = await getTagsApi(searchForm.keyword.trim() || undefined)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '获取标签失败')
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  editingTag.value = null
  modalVisible.value = true
}

const handleEdit = (record: LedgerTag) => {
  editingTag.value = record
  modalVisible.value = true
}

const handleReset = () => {
  searchForm.keyword = ''
  getTagList()
}

const handleDelete = async (record: LedgerTag) => {
  try {
    await deleteTagApi(record.id)
    message.success('标签删除成功')
    await getTagList()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '标签删除失败')
  }
}

onMounted(() => {
  getTagList()
})
</script>

<template>
  <section class="page-wrapper">
    <header class="page-header">
      <div>
        <h1>标签管理</h1>
        <p>标签用于为账单补充自由维度。</p>
      </div>
      <a-button type="primary" @click="handleCreate">新增标签</a-button>
    </header>

    <a-form class="search-container" :model="searchForm" layout="inline" @finish="getTagList">
      <a-form-item label="关键词">
        <a-input
          v-model:value="searchForm.keyword"
          placeholder="搜索标签名称"
          allow-clear
          @press-enter="getTagList"
        />
      </a-form-item>
      <a-form-item>
        <a-space>
          <a-button type="primary" html-type="submit">查询</a-button>
          <a-button @click="handleReset">重置</a-button>
        </a-space>
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
        <template v-if="column.key === 'description'">{{ record.description || '-' }}</template>
        <template v-else-if="column.key === 'createdAt'">
          {{ formatDateTime(record.createdAt) }}
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space>
            <a-button type="link" size="small" @click="handleEdit(record)">编辑</a-button>
            <a-popconfirm title="确认删除这个标签吗？" @confirm="handleDelete(record)">
              <a-button type="link" danger size="small">删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <TagFormModal v-model:visible="modalVisible" :tag="editingTag" @success="getTagList" />
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
