<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { FormInstance, Rule } from 'ant-design-vue/es/form'
import dayjs, { type Dayjs } from 'dayjs'

import type { Account } from '@/api/account'
import type { Category, TransactionType } from '@/api/category'
import {
  getImportRecordApi,
  updateImportRecordApi,
  type ImportRecord,
  type UpdateImportRecordParams,
} from '@/api/import'
import type { Ledger } from '@/api/ledger'
import { ApiError } from '@/api/request'
import type { LedgerTag } from '@/api/tag'

interface ImportRecordForm {
  type: TransactionType | undefined
  amount: string
  transactionTime: Dayjs | null
  merchant: string
  description: string
  remark: string
  categoryId: string | undefined
  accountId: string | undefined
  ledgerId: string | undefined
  tagIds: string[]
}

interface Props {
  visible: boolean
  recordId?: string | null
  readonly?: boolean
  ledgers: Ledger[]
  categories: Category[]
  accounts: Account[]
  tags: LedgerTag[]
}

const props = withDefaults(defineProps<Props>(), {
  recordId: null,
  readonly: false,
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  success: []
  'show-raw': [value: unknown]
}>()

const FormRef = ref<FormInstance>()
const detailLoading = ref(false)
const submitLoading = ref(false)
const record = ref<ImportRecord | null>(null)
const formData = reactive<ImportRecordForm>({
  type: undefined,
  amount: '',
  transactionTime: null,
  merchant: '',
  description: '',
  remark: '',
  categoryId: undefined,
  accountId: undefined,
  ledgerId: undefined,
  tagIds: [],
})

const linkedExisting = computed(
  () =>
    record.value?.decision === 'LINK_EXISTING' || record.value?.reconcileStatus === 'AUTO_MATCH',
)
const categoryOptions = computed(() =>
  props.categories
    .filter((item) => item.type === formData.type && item.isActive)
    .map((item) => ({ label: item.parentId ? `↳ ${item.name}` : item.name, value: item.id })),
)
const accountOptions = computed(() =>
  props.accounts
    .filter((item) => item.isActive)
    .map((item) => ({ label: item.name, value: item.id })),
)
const ledgerOptions = computed(() =>
  props.ledgers.map((item) => ({
    label: item.isDefault ? `${item.name}（默认）` : item.name,
    value: item.id,
  })),
)
const tagOptions = computed(() => props.tags.map((item) => ({ label: item.name, value: item.id })))

const formRules: Record<string, Rule[]> = {
  type: [{ required: true, message: '请选择收支类型', trigger: 'change' }],
  amount: [
    { required: true, message: '请输入金额', trigger: 'blur' },
    { pattern: /^\d+(?:\.\d{1,4})?$/, message: '金额格式不正确', trigger: 'blur' },
  ],
  transactionTime: [{ required: true, message: '请选择交易时间', trigger: 'change' }],
  ledgerId: [{ required: true, message: '请选择账本', trigger: 'change' }],
}

const resetForm = () => {
  formData.type = undefined
  formData.amount = ''
  formData.transactionTime = null
  formData.merchant = ''
  formData.description = ''
  formData.remark = ''
  formData.categoryId = undefined
  formData.accountId = undefined
  formData.ledgerId = undefined
  formData.tagIds = []
  FormRef.value?.clearValidate()
}

const initialize = async () => {
  resetForm()
  record.value = null
  if (!props.recordId) return

  try {
    detailLoading.value = true
    const result = await getImportRecordApi(props.recordId)
    record.value = result
    formData.type = result.type || undefined
    formData.amount = result.amount || ''
    formData.transactionTime = result.transactionTime ? dayjs(result.transactionTime) : null
    formData.merchant = result.merchant || ''
    formData.description = result.description || ''
    formData.remark = result.remark || ''
    formData.categoryId = result.categoryId || undefined
    formData.accountId = result.accountId || undefined
    formData.ledgerId = result.ledgerId || undefined
    formData.tagIds = result.tags.map((item) => item.id)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '获取导入记录失败')
    emit('update:visible', false)
  } finally {
    detailLoading.value = false
  }
}

const handleTypeChange = () => {
  if (!categoryOptions.value.some((item) => item.value === formData.categoryId)) {
    formData.categoryId = undefined
  }
}

const handleClose = () => emit('update:visible', false)

const handleSubmit = async () => {
  if (!props.recordId || props.readonly) return

  try {
    await FormRef.value?.validate()
    if (!formData.type || !formData.transactionTime || !formData.ledgerId) return
    submitLoading.value = true
    const params: UpdateImportRecordParams = {
      type: formData.type,
      amount: formData.amount,
      transactionTime: formData.transactionTime.toISOString(),
      merchant: formData.merchant,
      description: formData.description,
      remark: formData.remark,
      categoryId: formData.categoryId || null,
      accountId: formData.accountId || null,
      ledgerId: formData.ledgerId,
      tagIds: formData.tagIds,
    }
    await updateImportRecordApi(props.recordId, params)
    message.success('导入记录已保存')
    emit('success')
    emit('update:visible', false)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '保存导入记录失败')
  } finally {
    submitLoading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) void initialize()
  },
)
</script>

<template>
  <a-drawer
    :open="props.visible"
    title="导入记录详情"
    :width="720"
    :closable="!submitLoading"
    @close="handleClose"
  >
    <a-spin :spinning="detailLoading">
      <template v-if="record">
        <a-alert
          v-if="linkedExisting"
          class="field-warning"
          type="warning"
          show-icon
          message="该记录将关联已有账单"
          description="确认时只会新增平台来源，不会用这里的分类、标签、账本、账户或备注覆盖已有账单。"
        />

        <a-alert
          v-if="record.reconcileStatus === 'CHANGED'"
          class="field-warning"
          type="info"
          show-icon
          message="应用变化只更新平台来源事实"
          description="不会自动修改账单类型、时间、商户、说明、备注、分类、标签、账本或账户；仅明确退款净额规则可能调整统计金额。"
        />

        <a-descriptions title="平台来源事实" :column="2" bordered size="small">
          <a-descriptions-item label="平台金额">{{
            record.sourceAmount || '—'
          }}</a-descriptions-item>
          <a-descriptions-item label="来源类型">{{
            record.sourceRecordKind || '—'
          }}</a-descriptions-item>
          <a-descriptions-item label="平台交易号">
            {{ record.sourceTransactionId || '—' }}
          </a-descriptions-item>
          <a-descriptions-item label="平台订单号">{{
            record.sourceOrderId || '—'
          }}</a-descriptions-item>
          <a-descriptions-item label="平台时间">
            {{
              record.sourceTransactionTime
                ? dayjs(record.sourceTransactionTime).format('YYYY-MM-DD HH:mm:ss')
                : '—'
            }}
          </a-descriptions-item>
          <a-descriptions-item label="平台状态">{{
            record.sourceStatus || '—'
          }}</a-descriptions-item>
        </a-descriptions>

        <template v-if="record.reconcileStatus === 'CHANGED' && record.candidateSourceRecord">
          <a-divider>变化对比</a-divider>
          <div class="diff-grid">
            <div>
              <strong>历史来源</strong>
              <pre>{{ JSON.stringify(record.candidateSourceRecord, null, 2) }}</pre>
            </div>
            <div>
              <strong>本次来源</strong>
              <pre>{{
                JSON.stringify(
                  {
                    source: record.source,
                    sourceAmount: record.sourceAmount,
                    sourceTransactionTime: record.sourceTransactionTime,
                    sourceStatus: record.sourceStatus,
                    sourceCategory: record.sourceCategory,
                    paymentMethod: record.paymentMethod,
                  },
                  null,
                  2,
                )
              }}</pre>
            </div>
          </div>
          <p class="reason-text">{{ record.changeReason || '平台来源事实发生变化' }}</p>
        </template>

        <a-divider>标准化账单字段</a-divider>
        <a-form
          ref="FormRef"
          :disabled="props.readonly"
          :model="formData"
          :rules="formRules"
          layout="vertical"
        >
          <div class="form-grid">
            <a-form-item label="收支类型" name="type">
              <a-select
                v-model:value="formData.type"
                :options="[
                  { label: '支出', value: 'EXPENSE' },
                  { label: '收入', value: 'INCOME' },
                ]"
                @change="handleTypeChange"
              />
            </a-form-item>
            <a-form-item label="统计金额" name="amount">
              <a-input v-model:value="formData.amount" prefix="¥" />
            </a-form-item>
          </div>
          <a-form-item label="交易时间" name="transactionTime">
            <a-date-picker
              v-model:value="formData.transactionTime"
              show-time
              format="YYYY-MM-DD HH:mm:ss"
              style="width: 100%"
            />
          </a-form-item>
          <a-form-item label="商户"><a-input v-model:value="formData.merchant" /></a-form-item>
          <a-form-item label="交易说明">
            <a-textarea v-model:value="formData.description" :rows="2" />
          </a-form-item>
          <a-form-item label="用户备注">
            <a-textarea v-model:value="formData.remark" :rows="2" />
          </a-form-item>
          <div class="form-grid">
            <a-form-item label="分类">
              <a-select
                v-model:value="formData.categoryId"
                :options="categoryOptions"
                allow-clear
                show-search
                option-filter-prop="label"
              />
            </a-form-item>
            <a-form-item label="账户">
              <a-select
                v-model:value="formData.accountId"
                :options="accountOptions"
                allow-clear
                show-search
                option-filter-prop="label"
              />
            </a-form-item>
          </div>
          <a-form-item label="账本" name="ledgerId">
            <a-select v-model:value="formData.ledgerId" :options="ledgerOptions" />
          </a-form-item>
          <a-form-item label="标签">
            <a-select
              v-model:value="formData.tagIds"
              :options="tagOptions"
              mode="multiple"
              allow-clear
            />
          </a-form-item>
        </a-form>

        <a-space>
          <a-button @click="emit('show-raw', record.rawData)">查看原始数据</a-button>
        </a-space>
      </template>
    </a-spin>

    <template #footer>
      <a-space class="drawer-actions">
        <a-button :disabled="submitLoading" @click="handleClose">关闭</a-button>
        <a-button
          v-if="!props.readonly"
          type="primary"
          :loading="submitLoading"
          @click="handleSubmit"
        >
          保存整理字段
        </a-button>
      </a-space>
    </template>
  </a-drawer>
</template>

<style scoped lang="less">
.field-warning {
  margin-bottom: 16px;
}

.form-grid,
.diff-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.diff-grid pre {
  min-height: 150px;
  padding: 12px;
  overflow: auto;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
}

.reason-text {
  color: #595959;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
