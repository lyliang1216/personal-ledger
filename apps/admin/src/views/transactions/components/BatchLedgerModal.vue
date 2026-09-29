<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'

import type { Ledger } from '@/api/ledger'
import { ApiError } from '@/api/request'
import { batchUpdateLedgerApi } from '@/api/transaction'

interface Props {
  visible: boolean
  transactionIds: string[]
  ledgers: Ledger[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  success: []
}>()

const ledgerId = ref<string>()
const submitLoading = ref(false)

const ledgerOptions = computed(() =>
  props.ledgers.map((item) => ({
    label: item.isDefault ? `${item.name}（默认）` : item.name,
    value: item.id,
  })),
)

const handleCancel = () => emit('update:visible', false)

const handleSubmit = async () => {
  if (!ledgerId.value) {
    message.warning('请选择账本')
    return
  }

  try {
    submitLoading.value = true
    await batchUpdateLedgerApi(props.transactionIds, ledgerId.value)
    message.success(`已移动 ${props.transactionIds.length} 条账单`)
    emit('success')
    emit('update:visible', false)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '批量移动账本失败')
  } finally {
    submitLoading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) ledgerId.value = undefined
  },
)
</script>

<template>
  <a-modal
    :open="props.visible"
    title="批量移动账本"
    :confirm-loading="submitLoading"
    @cancel="handleCancel"
    @ok="handleSubmit"
  >
    <p>将选中的 {{ props.transactionIds.length }} 条账单移动到：</p>
    <a-select
      v-model:value="ledgerId"
      :options="ledgerOptions"
      placeholder="请选择账本"
      style="width: 100%"
    />
  </a-modal>
</template>

<style scoped lang="less"></style>
