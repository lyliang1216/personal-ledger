<script setup lang="ts">
import { ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'

import {
  getImportCandidatesApi,
  ignoreImportRecordApi,
  updateImportDecisionApi,
  type ImportCandidateTransaction,
  type ImportRecord,
} from '@/api/import'
import { ApiError } from '@/api/request'
import { transactionSourceLabels } from '@/api/transaction'

interface Props {
  visible: boolean
  record?: ImportRecord | null
}

const props = withDefaults(defineProps<Props>(), {
  record: null,
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  success: []
}>()

const loading = ref(false)
const submitLoading = ref(false)
const candidates = ref<ImportCandidateTransaction[]>([])
const selectedTransactionId = ref<string>()

const loadCandidates = async () => {
  if (!props.record) return
  try {
    loading.value = true
    candidates.value = await getImportCandidatesApi(props.record.id)
    selectedTransactionId.value = props.record.candidateTransactionId || undefined
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '获取候选账单失败')
  } finally {
    loading.value = false
  }
}

const handleClose = () => emit('update:visible', false)

const handleCreateNew = async () => {
  if (!props.record) return
  try {
    submitLoading.value = true
    await updateImportDecisionApi(props.record.id, 'CREATE_NEW')
    message.success('已选择创建新账单')
    emit('success')
    handleClose()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '保存处理决定失败')
  } finally {
    submitLoading.value = false
  }
}

const handleLink = async () => {
  if (!props.record || !selectedTransactionId.value) {
    message.warning('请选择要关联的已有账单')
    return
  }

  try {
    submitLoading.value = true
    const selected = candidates.value.find((item) => item.id === selectedTransactionId.value)
    const normalSource = selected?.sources?.find((item) => item.sourceRecordKind === 'NORMAL')
    await updateImportDecisionApi(
      props.record.id,
      'LINK_EXISTING',
      selectedTransactionId.value,
      normalSource?.id,
    )
    message.success('已选择关联已有账单')
    emit('success')
    handleClose()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '保存关联决定失败')
  } finally {
    submitLoading.value = false
  }
}

const handleIgnore = async () => {
  if (!props.record) return
  try {
    submitLoading.value = true
    await ignoreImportRecordApi(props.record.id)
    message.success('已忽略该记录')
    emit('success')
    handleClose()
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '忽略记录失败')
  } finally {
    submitLoading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) void loadCandidates()
  },
)
</script>

<template>
  <a-modal
    :open="props.visible"
    title="选择疑似匹配的账单"
    :width="760"
    :confirm-loading="submitLoading"
    :footer="null"
    @cancel="handleClose"
  >
    <a-alert
      class="match-warning"
      type="warning"
      show-icon
      message="关联已有账单只会新增来源记录"
      description="导入记录中的分类、标签、账本、账户和备注不会覆盖已有账单。退款关联后会按全部已确认退款重新计算净额。"
    />

    <a-descriptions v-if="props.record" class="incoming-record" :column="3" bordered size="small">
      <a-descriptions-item label="当前记录">
        {{ props.record.merchant || props.record.description || '未命名记录' }}
      </a-descriptions-item>
      <a-descriptions-item label="时间">
        {{
          props.record.transactionTime
            ? dayjs(props.record.transactionTime).format('YYYY-MM-DD HH:mm:ss')
            : '—'
        }}
      </a-descriptions-item>
      <a-descriptions-item label="金额">¥{{ props.record.amount || '—' }}</a-descriptions-item>
      <a-descriptions-item label="匹配依据" :span="3">
        {{ props.record.reconcileReason || '平台记录与历史账单存在相似特征' }}
      </a-descriptions-item>
    </a-descriptions>

    <a-spin :spinning="loading">
      <a-radio-group v-model:value="selectedTransactionId" class="candidate-list">
        <a-radio v-for="candidate in candidates" :key="candidate.id" :value="candidate.id">
          <div class="candidate-card">
            <strong>{{ candidate.merchant || candidate.description || '未命名账单' }}</strong>
            <span>{{ dayjs(candidate.transactionTime).format('YYYY-MM-DD HH:mm:ss') }}</span>
            <span>¥{{ candidate.amount }}</span>
            <span v-if="candidate.sources?.length">
              来源：{{
                candidate.sources.map((item) => transactionSourceLabels[item.source]).join(' / ')
              }}
            </span>
          </div>
        </a-radio>
      </a-radio-group>
      <a-result v-if="!loading && !candidates.length" status="info" title="当前没有可选候选账单" />
    </a-spin>

    <div class="modal-actions">
      <a-button :disabled="submitLoading" @click="handleClose">取消</a-button>
      <a-button danger :loading="submitLoading" @click="handleIgnore">忽略</a-button>
      <a-button :loading="submitLoading" @click="handleCreateNew">作为新账单导入</a-button>
      <a-button
        type="primary"
        :disabled="!selectedTransactionId"
        :loading="submitLoading"
        @click="handleLink"
      >
        关联选中账单
      </a-button>
    </div>
  </a-modal>
</template>

<style scoped lang="less">
.match-warning {
  margin-bottom: 16px;
}

.incoming-record {
  margin-bottom: 16px;
}

.candidate-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 420px;
  overflow: auto;

  :deep(.ant-radio-wrapper) {
    align-items: flex-start;
    padding: 12px;
    margin: 0 0 8px;
    border: 1px solid #f0f0f0;
    border-radius: 6px;
  }
}

.candidate-card {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 180px 100px minmax(150px, 1fr);
  gap: 12px;
  margin-left: 4px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 16px;
  margin-top: 16px;
  border-top: 1px solid #f0f0f0;
}
</style>
