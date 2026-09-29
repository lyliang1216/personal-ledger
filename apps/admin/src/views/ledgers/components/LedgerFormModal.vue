<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { FormInstance, Rule } from 'ant-design-vue/es/form'

import {
  createLedgerApi,
  updateLedgerApi,
  type CreateLedgerParams,
  type Ledger,
} from '@/api/ledger'
import { ApiError } from '@/api/request'

interface Props {
  visible: boolean
  ledger?: Ledger | null
}

const props = withDefaults(defineProps<Props>(), {
  ledger: null,
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  success: []
}>()

const FormRef = ref<FormInstance>()
const submitLoading = ref(false)
const formData = reactive<CreateLedgerParams>({
  name: '',
  description: '',
})

const modalTitle = computed(() => (props.ledger ? '编辑账本' : '新增账本'))

const formRules: Record<string, Rule[]> = {
  name: [
    { required: true, message: '请输入账本名称', trigger: 'blur' },
    { max: 100, message: '账本名称最多100个字符', trigger: 'blur' },
  ],
  description: [{ max: 500, message: '描述最多500个字符', trigger: 'blur' }],
}

const resetForm = () => {
  formData.name = ''
  formData.description = ''
  FormRef.value?.clearValidate()
}

const handleCancel = () => {
  emit('update:visible', false)
}

const handleSubmit = async () => {
  try {
    await FormRef.value?.validate()
    submitLoading.value = true

    const params = {
      name: formData.name,
      description: formData.description,
    }

    if (props.ledger) {
      await updateLedgerApi(props.ledger.id, params)
    } else {
      await createLedgerApi(params)
    }

    message.success('账本保存成功')
    emit('success')
    emit('update:visible', false)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '账本保存失败')
  } finally {
    submitLoading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return

    resetForm()

    if (props.ledger) {
      formData.name = props.ledger.name
      formData.description = props.ledger.description || ''
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
      <a-form-item label="账本名称" name="name">
        <a-input v-model:value="formData.name" placeholder="请输入账本名称" allow-clear />
      </a-form-item>
      <a-form-item label="描述" name="description">
        <a-textarea
          v-model:value="formData.description"
          placeholder="请输入描述"
          :rows="3"
          allow-clear
        />
      </a-form-item>
    </a-form>
  </a-modal>
</template>
