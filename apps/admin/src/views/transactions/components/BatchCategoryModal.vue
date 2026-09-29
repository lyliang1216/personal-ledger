<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'

import type { Category, TransactionType } from '@/api/category'
import { ApiError } from '@/api/request'
import { batchUpdateCategoryApi } from '@/api/transaction'

interface Props {
  visible: boolean
  transactionIds: string[]
  transactionType?: TransactionType
  categories: Category[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  success: []
}>()

const categoryId = ref<string>()
const submitLoading = ref(false)

const categoryOptions = computed(() =>
  props.categories
    .filter(
      (item) => item.isActive && (!props.transactionType || item.type === props.transactionType),
    )
    .map((item) => ({ label: item.parentId ? `↳ ${item.name}` : item.name, value: item.id })),
)

const handleCancel = () => emit('update:visible', false)

const handleSubmit = async () => {
  if (!categoryId.value) {
    message.warning('请选择分类')
    return
  }

  try {
    submitLoading.value = true
    await batchUpdateCategoryApi(props.transactionIds, categoryId.value)
    message.success(`已修改 ${props.transactionIds.length} 条账单的分类`)
    emit('success')
    emit('update:visible', false)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '批量修改分类失败')
  } finally {
    submitLoading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) categoryId.value = undefined
  },
)
</script>

<template>
  <a-modal
    :open="props.visible"
    title="批量修改分类"
    :confirm-loading="submitLoading"
    @cancel="handleCancel"
    @ok="handleSubmit"
  >
    <p>将选中的 {{ props.transactionIds.length }} 条账单修改为：</p>
    <a-select
      v-model:value="categoryId"
      :options="categoryOptions"
      placeholder="请选择启用的分类"
      show-search
      option-filter-prop="label"
      style="width: 100%"
    />
  </a-modal>
</template>

<style scoped lang="less"></style>
