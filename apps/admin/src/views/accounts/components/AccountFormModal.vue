<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { FormInstance, Rule } from 'ant-design-vue/es/form'

import { createAccountApi, updateAccountApi, type Account, type AccountType } from '@/api/account'
import { ApiError } from '@/api/request'

interface AccountForm {
  name: string
  type: AccountType
  description: string
  isActive: boolean
}

interface Props {
  visible: boolean
  account?: Account | null
}

const props = withDefaults(defineProps<Props>(), {
  account: null,
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  success: []
}>()

const FormRef = ref<FormInstance>()
const submitLoading = ref(false)
const formData = reactive<AccountForm>({
  name: '',
  type: 'OTHER',
  description: '',
  isActive: true,
})
const accountTypeOptions = [
  { label: '现金', value: 'CASH' },
  { label: '微信', value: 'WECHAT' },
  { label: '支付宝', value: 'ALIPAY' },
  { label: '银行卡', value: 'BANK_CARD' },
  { label: '信用卡', value: 'CREDIT_CARD' },
  { label: '京东', value: 'JD' },
  { label: '其他', value: 'OTHER' },
] satisfies { label: string; value: AccountType }[]

const modalTitle = computed(() => (props.account ? '编辑账户' : '新增账户'))

const formRules: Record<string, Rule[]> = {
  name: [
    { required: true, message: '请输入账户名称', trigger: 'blur' },
    { max: 100, message: '账户名称最多100个字符', trigger: 'blur' },
  ],
  type: [{ required: true, message: '请选择账户类型', trigger: 'change' }],
  description: [{ max: 500, message: '描述最多500个字符', trigger: 'blur' }],
}

const resetForm = () => {
  formData.name = ''
  formData.type = 'OTHER'
  formData.description = ''
  formData.isActive = true
  FormRef.value?.clearValidate()
}

const handleCancel = () => emit('update:visible', false)

const handleSubmit = async () => {
  try {
    await FormRef.value?.validate()
    submitLoading.value = true

    if (props.account) {
      await updateAccountApi(props.account.id, formData)
    } else {
      await createAccountApi({
        name: formData.name,
        type: formData.type,
        description: formData.description,
      })
    }

    message.success('账户保存成功')
    emit('success')
    emit('update:visible', false)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '账户保存失败')
  } finally {
    submitLoading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return

    resetForm()
    if (props.account) {
      formData.name = props.account.name
      formData.type = props.account.type
      formData.description = props.account.description || ''
      formData.isActive = props.account.isActive
    }
  },
  { immediate: true },
)
</script>

<template>
  <a-modal
    :open="props.visible"
    :title="modalTitle"
    :confirm-loading="submitLoading"
    @cancel="handleCancel"
    @ok="handleSubmit"
  >
    <a-form ref="FormRef" :model="formData" :rules="formRules" layout="vertical">
      <a-form-item label="账户名称" name="name">
        <a-input v-model:value="formData.name" placeholder="请输入账户名称" allow-clear />
      </a-form-item>
      <a-form-item label="账户类型" name="type">
        <a-select v-model:value="formData.type" :options="accountTypeOptions" />
      </a-form-item>
      <a-form-item label="描述" name="description">
        <a-textarea
          v-model:value="formData.description"
          placeholder="请输入描述"
          :rows="3"
          allow-clear
        />
      </a-form-item>
      <a-form-item v-if="props.account" label="是否启用" name="isActive">
        <a-switch v-model:checked="formData.isActive" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>
