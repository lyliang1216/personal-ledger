<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { FormInstance, Rule } from 'ant-design-vue/es/form'

import {
  createCategoryApi,
  updateCategoryApi,
  type Category,
  type TransactionType,
} from '@/api/category'
import { ApiError } from '@/api/request'

interface CategoryForm {
  name: string
  type: TransactionType
  icon: string
  sort: number
  isActive: boolean
}

interface Props {
  visible: boolean
  category?: Category | null
  parentCategory?: Category | null
}

const props = withDefaults(defineProps<Props>(), {
  category: null,
  parentCategory: null,
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  success: []
}>()

const FormRef = ref<FormInstance>()
const submitLoading = ref(false)
const formData = reactive<CategoryForm>({
  name: '',
  type: 'EXPENSE',
  icon: '',
  sort: 0,
  isActive: true,
})
const typeOptions = [
  { label: '支出', value: 'EXPENSE' },
  { label: '收入', value: 'INCOME' },
] satisfies { label: string; value: TransactionType }[]

const modalTitle = computed(() => {
  if (props.category) return '编辑分类'
  return props.parentCategory ? '新增子分类' : '新增一级分类'
})
const typeDisabled = computed(() => Boolean(props.category || props.parentCategory))

const formRules: Record<string, Rule[]> = {
  name: [
    { required: true, message: '请输入分类名称', trigger: 'blur' },
    { max: 100, message: '分类名称最多100个字符', trigger: 'blur' },
  ],
  type: [{ required: true, message: '请选择收支类型', trigger: 'change' }],
  icon: [{ max: 100, message: '图标标识最多100个字符', trigger: 'blur' }],
  sort: [{ required: true, type: 'number', message: '请输入排序值', trigger: 'blur' }],
}

const resetForm = () => {
  formData.name = ''
  formData.type = props.parentCategory?.type || 'EXPENSE'
  formData.icon = ''
  formData.sort = 0
  formData.isActive = true
  FormRef.value?.clearValidate()
}

const handleCancel = () => emit('update:visible', false)

const handleSubmit = async () => {
  try {
    await FormRef.value?.validate()
    submitLoading.value = true

    if (props.category) {
      await updateCategoryApi(props.category.id, {
        name: formData.name,
        icon: formData.icon,
        sort: formData.sort,
        isActive: formData.isActive,
      })
    } else {
      await createCategoryApi({
        name: formData.name,
        type: formData.type,
        parentId: props.parentCategory?.id,
        icon: formData.icon,
        sort: formData.sort,
      })
    }

    message.success('分类保存成功')
    emit('success')
    emit('update:visible', false)
  } catch (error) {
    console.error(error)
    message.error(error instanceof ApiError ? error.message : '分类保存失败')
  } finally {
    submitLoading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return

    resetForm()
    if (props.category) {
      formData.name = props.category.name
      formData.type = props.category.type
      formData.icon = props.category.icon || ''
      formData.sort = props.category.sort
      formData.isActive = props.category.isActive
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
      <a-form-item v-if="props.parentCategory" label="父分类">
        <a-input :value="props.parentCategory.name" disabled />
      </a-form-item>
      <a-form-item label="分类名称" name="name">
        <a-input v-model:value="formData.name" placeholder="请输入分类名称" allow-clear />
      </a-form-item>
      <a-form-item label="收支类型" name="type">
        <a-select v-model:value="formData.type" :options="typeOptions" :disabled="typeDisabled" />
      </a-form-item>
      <a-form-item label="图标标识" name="icon">
        <a-input v-model:value="formData.icon" placeholder="可选" allow-clear />
      </a-form-item>
      <a-form-item label="排序" name="sort">
        <a-input-number v-model:value="formData.sort" :min="0" :precision="0" />
      </a-form-item>
      <a-form-item v-if="props.category" label="是否启用" name="isActive">
        <a-switch v-model:checked="formData.isActive" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>
