<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'

import type { ImportRecord } from '@/api/import'

interface Props {
  visible: boolean
  record?: ImportRecord | null
}

const props = withDefaults(defineProps<Props>(), {
  record: null,
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  apply: [record: ImportRecord]
  ignore: [record: ImportRecord]
  'show-raw': [value: unknown]
}>()

const comparisonRows = computed(() => {
  const oldSource = props.record?.candidateSourceRecord
  const record = props.record
  if (!oldSource || !record) return []

  return [
    { label: '平台金额', before: oldSource.sourceAmount, after: record.sourceAmount },
    {
      label: '平台时间',
      before: oldSource.sourceTransactionTime
        ? dayjs(oldSource.sourceTransactionTime).format('YYYY-MM-DD HH:mm:ss')
        : '—',
      after: record.sourceTransactionTime
        ? dayjs(record.sourceTransactionTime).format('YYYY-MM-DD HH:mm:ss')
        : '—',
    },
    { label: '平台状态', before: oldSource.sourceStatus || '—', after: record.sourceStatus || '—' },
    {
      label: '平台分类',
      before: oldSource.sourceCategory || '—',
      after: record.sourceCategory || '—',
    },
    {
      label: '支付方式',
      before: oldSource.paymentMethod || '—',
      after: record.paymentMethod || '—',
    },
    {
      label: '统计金额',
      before: record.candidateTransaction?.amount || '—',
      after: record.amount || '—',
    },
  ]
})

const handleClose = () => emit('update:visible', false)

const handleApply = () => {
  if (props.record) emit('apply', props.record)
}

const handleIgnore = () => {
  if (props.record) emit('ignore', props.record)
}
</script>

<template>
  <a-drawer :open="props.visible" title="历史来源变化对比" :width="720" @close="handleClose">
    <a-alert
      class="comparison-hint"
      type="warning"
      show-icon
      message="应用变化只更新平台来源事实"
      description="不会覆盖账单类型、时间、商户、说明、备注、分类、标签、账本或账户；仅明确退款净额规则可能调整统计金额。"
    />
    <p class="reason-text">{{ props.record?.changeReason || '平台来源事实发生变化' }}</p>
    <a-table :data-source="comparisonRows" :pagination="false" row-key="label" size="small">
      <a-table-column key="label" title="字段" data-index="label" width="140" />
      <a-table-column key="before" title="历史值" data-index="before" />
      <a-table-column key="after" title="新值" data-index="after" />
    </a-table>
    <a-button class="raw-button" @click="emit('show-raw', props.record?.rawData)">
      查看本次原始数据
    </a-button>

    <template #footer>
      <div class="drawer-actions">
        <a-button @click="handleClose">关闭</a-button>
        <a-button danger @click="handleIgnore">忽略此次变化</a-button>
        <a-button type="primary" @click="handleApply">应用变化</a-button>
      </div>
    </template>
  </a-drawer>
</template>

<style scoped lang="less">
.comparison-hint {
  margin-bottom: 16px;
}

.reason-text {
  color: #595959;
}

.raw-button {
  margin-top: 16px;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
