<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'

import { ApiError } from '@/api/request'
import type { LedgerTag } from '@/api/tag'
import { batchUpdateTagsApi, type BatchTagMode } from '@/api/transaction'

interface Props {
  visible: boolean
  transactionIds: string[]
  tags: LedgerTag[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  success: []
}>()

const mode = ref<BatchTagMode>('ADD')
const tagIds = ref<string[]>([])
const submitLoading = ref(false)

const tagOptions = computed(() => props.tags.map((item) => ({ label: item.name, value: item.id })))

const handleCancel = () => emit('update:visible', false)

const handleSubmit = async () => {
  if (!tagIds.value.length) {
    message.warning('请至少选择一个标签')
    return
  }

  try {
    submitLoading.value = true
    await batchUpdateTagsApi(props.transactionIds, tagIds.value, mode.value)
    message.success(mode.value === 'ADD' ? '标签添加成功' : '标签移除成功')
    emit('success')
    emit('update:visible', false)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '批量修改标签失败')
  } finally {
    submitLoading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    mode.value = 'ADD'
    tagIds.value = []
  },
)
</script>

<template>
  <a-modal
    :open="props.visible"
    title="批量修改标签"
    :confirm-loading="submitLoading"
    @cancel="handleCancel"
    @ok="handleSubmit"
  >
    <a-form layout="vertical">
      <a-form-item label="操作方式">
        <a-select
          v-model:value="mode"
          :options="[
            { label: '添加标签', value: 'ADD' },
            { label: '移除标签', value: 'REMOVE' },
          ]"
        />
      </a-form-item>
      <a-form-item label="标签">
        <a-select
          v-model:value="tagIds"
          :options="tagOptions"
          mode="multiple"
          placeholder="请选择标签"
          show-search
          option-filter-prop="label"
        />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<style scoped lang="less"></style>
