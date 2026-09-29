<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'

import {
  deleteCategoryApi,
  getCategoriesApi,
  type Category,
  type TransactionType,
} from '@/api/category'
import { ApiError } from '@/api/request'

import CategoryFormModal from './components/CategoryFormModal.vue'

interface CategoryTreeNode extends Category {
  level: 1 | 2
  children?: CategoryTreeNode[]
}

const loading = ref(false)
const tableData = ref<Category[]>([])
const expandedRowKeys = ref<string[]>([])
const modalVisible = ref(false)
const editingCategory = ref<Category | null>(null)
const parentCategory = ref<Category | null>(null)
const searchForm = reactive<{ type: TransactionType | undefined }>({ type: undefined })
const typeOptions = [
  { label: '全部', value: undefined },
  { label: '支出', value: 'EXPENSE' },
  { label: '收入', value: 'INCOME' },
]

const columns: TableColumnsType<CategoryTreeNode> = [
  { title: '分类名称', dataIndex: 'name', key: 'name' },
  { title: '类型', dataIndex: 'type', key: 'type', width: 90 },
  { title: '层级', dataIndex: 'level', key: 'level', width: 90 },
  { title: '状态', dataIndex: 'isActive', key: 'isActive', width: 90 },
  { title: '排序', dataIndex: 'sort', key: 'sort', width: 80 },
  { title: '操作', key: 'action', width: 240 },
]

const categoryTree = computed<CategoryTreeNode[]>(() => {
  const nodeMap = new Map<string, CategoryTreeNode>()
  const roots: CategoryTreeNode[] = []

  tableData.value.forEach((item) => {
    nodeMap.set(item.id, { ...item, level: item.parentId ? 2 : 1 })
  })

  nodeMap.forEach((node) => {
    if (!node.parentId) {
      roots.push(node)
      return
    }

    const parent = nodeMap.get(node.parentId)
    if (parent) {
      parent.children = [...(parent.children || []), node]
    }
  })

  return roots
})

const getCategoryList = async () => {
  try {
    loading.value = true
    tableData.value = await getCategoriesApi(searchForm.type)
    const parentIds = new Set(
      tableData.value
        .map((item) => item.parentId)
        .filter((parentId): parentId is string => Boolean(parentId)),
    )
    expandedRowKeys.value = tableData.value
      .filter((item) => !item.parentId && parentIds.has(item.id))
      .map((item) => item.id)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '获取分类失败')
  } finally {
    loading.value = false
  }
}

const handleExpand = (expanded: boolean, record: CategoryTreeNode) => {
  expandedRowKeys.value = expanded
    ? [...new Set([...expandedRowKeys.value, record.id])]
    : expandedRowKeys.value.filter((id) => id !== record.id)
}

const handleCreate = (parent: Category | null = null) => {
  editingCategory.value = null
  parentCategory.value = parent
  modalVisible.value = true
}

const handleEdit = (record: Category) => {
  editingCategory.value = record
  parentCategory.value = record.parentId
    ? tableData.value.find((item) => item.id === record.parentId) || null
    : null
  modalVisible.value = true
}

const handleDelete = async (record: Category) => {
  try {
    await deleteCategoryApi(record.id)
    message.success('分类删除成功')
    await getCategoryList()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '分类删除失败')
  }
}

onMounted(() => {
  getCategoryList()
})
</script>

<template>
  <section class="page-wrapper">
    <header class="page-header">
      <div>
        <h1>分类管理</h1>
        <p>分类最多支持两级，创建后不允许修改所属层级和收支类型。</p>
      </div>
      <a-button type="primary" @click="handleCreate()">新增一级分类</a-button>
    </header>

    <a-form class="search-container" :model="searchForm" layout="inline">
      <a-form-item label="收支类型">
        <a-select
          v-model:value="searchForm.type"
          :options="typeOptions"
          style="width: 140px"
          @change="getCategoryList"
        />
      </a-form-item>
    </a-form>

    <a-table
      :columns="columns"
      :data-source="categoryTree"
      :expanded-row-keys="expandedRowKeys"
      :loading="loading"
      :pagination="false"
      row-key="id"
      @expand="handleExpand"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'type'">
          <a-tag :color="record.type === 'EXPENSE' ? 'orange' : 'green'">
            {{ record.type === 'EXPENSE' ? '支出' : '收入' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'level'">
          {{ record.level === 1 ? '一级' : '二级' }}
        </template>
        <template v-else-if="column.key === 'isActive'">
          <a-tag :color="record.isActive ? 'green' : 'default'">
            {{ record.isActive ? '启用' : '停用' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space>
            <a-button
              v-if="record.level === 1"
              type="link"
              size="small"
              @click="handleCreate(record)"
            >
              新增子分类
            </a-button>
            <a-button type="link" size="small" @click="handleEdit(record)">编辑</a-button>
            <a-popconfirm title="确认删除这个分类吗？" @confirm="handleDelete(record)">
              <a-button type="link" danger size="small">删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <CategoryFormModal
      v-model:visible="modalVisible"
      :category="editingCategory"
      :parent-category="parentCategory"
      @success="getCategoryList"
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
