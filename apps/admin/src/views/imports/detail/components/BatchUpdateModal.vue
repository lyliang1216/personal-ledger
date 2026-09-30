<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'

import type { Account } from '@/api/account'
import type { Category } from '@/api/category'
import {
  batchUpdateImportAccountApi,
  batchUpdateImportCategoryApi,
  batchUpdateImportLedgerApi,
  batchUpdateImportTagsApi,
  type ImportTagBatchMode,
} from '@/api/import'
import type { Ledger } from '@/api/ledger'
import { ApiError } from '@/api/request'
import type { LedgerTag } from '@/api/tag'

type BatchMode = 'CATEGORY' | 'TAG' | 'LEDGER' | 'ACCOUNT'

interface Props {
  visible: boolean
  mode: BatchMode
  recordIds: string[]
  ledgers: Ledger[]
  categories: Category[]
  accounts: Account[]
  tags: LedgerTag[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  success: []
}>()

const submitLoading = ref(false)
const selectedId = ref<string>()
const selectedTagIds = ref<string[]>([])
const tagMode = ref<ImportTagBatchMode>('ADD')

const title = computed(() => {
  const titles: Record<BatchMode, string> = {
    CATEGORY: '批量设置分类',
    TAG: '批量整理标签',
    LEDGER: '批量设置账本',
    ACCOUNT: '批量设置账户',
  }
  return titles[props.mode]
})

const options = computed(() => {
  if (props.mode === 'CATEGORY') {
    return props.categories
      .filter((item) => item.isActive)
      .map((item) => ({
        label: `${item.type === 'EXPENSE' ? '支出' : '收入'} · ${item.name}`,
        value: item.id,
      }))
  }
  if (props.mode === 'LEDGER') {
    return props.ledgers.map((item) => ({ label: item.name, value: item.id }))
  }
  return props.accounts
    .filter((item) => item.isActive)
    .map((item) => ({ label: item.name, value: item.id }))
})

const tagOptions = computed(() => props.tags.map((item) => ({ label: item.name, value: item.id })))

const handleClose = () => emit('update:visible', false)

const handleSubmit = async () => {
  try {
    submitLoading.value = true
    if (props.mode === 'TAG') {
      if (!selectedTagIds.value.length) {
        message.warning('请至少选择一个标签')
        return
      }
      await batchUpdateImportTagsApi(props.recordIds, selectedTagIds.value, tagMode.value)
    } else {
      if (!selectedId.value) {
        message.warning('请选择要设置的内容')
        return
      }
      if (props.mode === 'CATEGORY') {
        await batchUpdateImportCategoryApi(props.recordIds, selectedId.value)
      } else if (props.mode === 'LEDGER') {
        await batchUpdateImportLedgerApi(props.recordIds, selectedId.value)
      } else {
        await batchUpdateImportAccountApi(props.recordIds, selectedId.value)
      }
    }
    message.success(`已更新 ${props.recordIds.length} 条导入记录`)
    emit('success')
    handleClose()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '批量更新失败')
  } finally {
    submitLoading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    selectedId.value = undefined
    selectedTagIds.value = []
    tagMode.value = 'ADD'
  },
)
</script>

<template>
  <a-modal
    :open="props.visible"
    :title="title"
    ok-text="确认"
    cancel-text="取消"
    :confirm-loading="submitLoading"
    @ok="handleSubmit"
    @cancel="handleClose"
  >
    <p>将修改选中的 {{ props.recordIds.length }} 条导入记录。</p>
    <template v-if="props.mode === 'TAG'">
      <a-form layout="vertical">
        <a-form-item label="处理方式">
          <a-radio-group v-model:value="tagMode">
            <a-radio value="ADD">添加标签</a-radio>
            <a-radio value="REMOVE">移除标签</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="标签">
          <a-select
            v-model:value="selectedTagIds"
            :options="tagOptions"
            mode="multiple"
            show-search
            option-filter-prop="label"
          />
        </a-form-item>
      </a-form>
    </template>
    <a-select
      v-else
      v-model:value="selectedId"
      :options="options"
      show-search
      option-filter-prop="label"
      style="width: 100%"
    />
  </a-modal>
</template>
