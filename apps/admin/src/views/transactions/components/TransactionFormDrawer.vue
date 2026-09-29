<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { FormInstance, Rule } from 'ant-design-vue/es/form'
import dayjs, { type Dayjs } from 'dayjs'

import type { Account } from '@/api/account'
import type { Category, TransactionType } from '@/api/category'
import type { Ledger } from '@/api/ledger'
import { ApiError } from '@/api/request'
import type { LedgerTag } from '@/api/tag'
import {
  createTransactionApi,
  getTransactionApi,
  updateTransactionApi,
  type TransactionWriteParams,
} from '@/api/transaction'

interface TransactionForm {
  type: TransactionType
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
  transactionId?: string | null
  ledgers: Ledger[]
  categories: Category[]
  accounts: Account[]
  tags: LedgerTag[]
}

const props = withDefaults(defineProps<Props>(), {
  transactionId: null,
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  success: []
}>()

const FormRef = ref<FormInstance>()
const detailLoading = ref(false)
const submitLoading = ref(false)
const formData = reactive<TransactionForm>({
  type: 'EXPENSE',
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

const drawerTitle = computed(() => (props.transactionId ? '编辑账单' : '新增账单'))
const categoryOptions = computed(() =>
  props.categories
    .filter(
      (item) =>
        item.type === formData.type &&
        (item.isActive || (props.transactionId && item.id === formData.categoryId)),
    )
    .map((item) => ({ label: item.parentId ? `↳ ${item.name}` : item.name, value: item.id })),
)
const accountOptions = computed(() =>
  props.accounts
    .filter((item) => item.isActive || (props.transactionId && item.id === formData.accountId))
    .map((item) => ({ label: item.name, value: item.id })),
)
const ledgerOptions = computed(() =>
  props.ledgers.map((item) => ({
    label: item.isDefault ? `${item.name}（默认）` : item.name,
    value: item.id,
  })),
)
const tagOptions = computed(() => props.tags.map((item) => ({ label: item.name, value: item.id })))

const validateAmount = async (_rule: Rule, value: string): Promise<void> => {
  if (!/^\d+(?:\.\d{1,4})?$/.test(value) || Number(value) <= 0) {
    return Promise.reject('请输入大于 0 且最多四位小数的金额')
  }

  return Promise.resolve()
}

const formRules: Record<string, Rule[]> = {
  type: [{ required: true, message: '请选择收支类型', trigger: 'change' }],
  amount: [{ required: true, validator: validateAmount, trigger: 'blur' }],
  transactionTime: [{ required: true, message: '请选择交易时间', trigger: 'change' }],
  ledgerId: [{ required: true, message: '请选择账本', trigger: 'change' }],
  merchant: [{ max: 255, message: '商户最多255个字符', trigger: 'blur' }],
}

const resetForm = () => {
  formData.type = 'EXPENSE'
  formData.amount = ''
  formData.transactionTime = dayjs()
  formData.merchant = ''
  formData.description = ''
  formData.remark = ''
  formData.categoryId = undefined
  formData.accountId = undefined
  formData.ledgerId = props.ledgers.find((item) => item.isDefault)?.id
  formData.tagIds = []
  FormRef.value?.clearValidate()
}

const initializeForm = async () => {
  try {
    resetForm()
    if (!props.transactionId) return

    detailLoading.value = true
    const transaction = await getTransactionApi(props.transactionId)
    formData.type = transaction.type
    formData.amount = transaction.amount
    formData.transactionTime = dayjs(transaction.transactionTime)
    formData.merchant = transaction.merchant || ''
    formData.description = transaction.description || ''
    formData.remark = transaction.remark || ''
    formData.categoryId = transaction.categoryId || undefined
    formData.accountId = transaction.accountId || undefined
    formData.ledgerId = transaction.ledgerId
    formData.tagIds = transaction.tags.map((item) => item.id)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '获取账单详情失败')
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
  try {
    await FormRef.value?.validate()
    if (!formData.transactionTime || !formData.ledgerId) return

    submitLoading.value = true
    const params: TransactionWriteParams = {
      type: formData.type,
      amount: formData.amount,
      transactionTime: formData.transactionTime.toISOString(),
      merchant: formData.merchant,
      description: formData.description,
      remark: formData.remark,
      ledgerId: formData.ledgerId,
      categoryId: formData.categoryId || null,
      accountId: formData.accountId || null,
      tagIds: formData.tagIds,
    }

    if (props.transactionId) {
      await updateTransactionApi(props.transactionId, params)
    } else {
      await createTransactionApi(params)
    }

    message.success('账单保存成功')
    emit('success')
    emit('update:visible', false)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '账单保存失败')
  } finally {
    submitLoading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) void initializeForm()
  },
  { immediate: true },
)
</script>

<template>
  <a-drawer
    :open="props.visible"
    :title="drawerTitle"
    :width="620"
    :closable="!submitLoading"
    @close="handleClose"
  >
    <a-form
      ref="FormRef"
      :disabled="detailLoading"
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
        <a-form-item label="金额" name="amount">
          <a-input v-model:value="formData.amount" placeholder="0.00" prefix="¥" />
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

      <a-form-item label="商户" name="merchant">
        <a-input v-model:value="formData.merchant" placeholder="请输入商户" allow-clear />
      </a-form-item>

      <a-form-item label="交易说明" name="description">
        <a-textarea
          v-model:value="formData.description"
          placeholder="请输入交易说明"
          :rows="2"
          allow-clear
        />
      </a-form-item>

      <a-form-item label="备注" name="remark">
        <a-textarea
          v-model:value="formData.remark"
          placeholder="请输入用户备注"
          :rows="3"
          allow-clear
        />
      </a-form-item>

      <div class="form-grid">
        <a-form-item label="分类" name="categoryId">
          <a-select
            v-model:value="formData.categoryId"
            :options="categoryOptions"
            placeholder="可选"
            allow-clear
            show-search
            option-filter-prop="label"
          />
        </a-form-item>
        <a-form-item label="账户" name="accountId">
          <a-select
            v-model:value="formData.accountId"
            :options="accountOptions"
            placeholder="可选"
            allow-clear
            show-search
            option-filter-prop="label"
          />
        </a-form-item>
      </div>

      <a-form-item label="账本" name="ledgerId">
        <a-select
          v-model:value="formData.ledgerId"
          :options="ledgerOptions"
          placeholder="请选择账本"
        />
      </a-form-item>

      <a-form-item label="标签" name="tagIds">
        <a-select
          v-model:value="formData.tagIds"
          :options="tagOptions"
          mode="multiple"
          placeholder="可选"
          allow-clear
          show-search
          option-filter-prop="label"
        />
      </a-form-item>
    </a-form>

    <template #footer>
      <a-space class="drawer-actions">
        <a-button :disabled="submitLoading" @click="handleClose">取消</a-button>
        <a-button type="primary" :loading="submitLoading" @click="handleSubmit">保存</a-button>
      </a-space>
    </template>
  </a-drawer>
</template>

<style scoped lang="less">
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
