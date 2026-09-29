<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { FormInstance, Rule } from 'ant-design-vue/es/form'

import { createTagApi, updateTagApi, type CreateTagParams, type LedgerTag } from '@/api/tag'
import { ApiError } from '@/api/request'

interface Props {
  visible: boolean
  tag?: LedgerTag | null
}

const props = withDefaults(defineProps<Props>(), {
  tag: null,
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  success: []
}>()

const FormRef = ref<FormInstance>()
const submitLoading = ref(false)
const formData = reactive<CreateTagParams>({ name: '', description: '' })

const modalTitle = computed(() => (props.tag ? '编辑标签' : '新增标签'))

const formRules: Record<string, Rule[]> = {
  name: [
    { required: true, message: '请输入标签名称', trigger: 'blur' },
    { max: 100, message: '标签名称最多100个字符', trigger: 'blur' },
  ],
  description: [{ max: 500, message: '描述最多500个字符', trigger: 'blur' }],
}

const resetForm = () => {
  formData.name = ''
  formData.description = ''
  FormRef.value?.clearValidate()
}

const handleCancel = () => emit('update:visible', false)

const handleSubmit = async () => {
  try {
    await FormRef.value?.validate()
    submitLoading.value = true

    if (props.tag) {
      await updateTagApi(props.tag.id, formData)
    } else {
      await createTagApi(formData)
    }

    message.success('标签保存成功')
    emit('success')
    emit('update:visible', false)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '标签保存失败')
  } finally {
    submitLoading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return

    resetForm()
    if (props.tag) {
      formData.name = props.tag.name
      formData.description = props.tag.description || ''
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
      <a-form-item label="标签名称" name="name">
        <a-input v-model:value="formData.name" placeholder="请输入标签名称" allow-clear />
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
