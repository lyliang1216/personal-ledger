<script setup lang="ts">
interface Props {
  visible: boolean
  rawData?: unknown
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const handleClose = () => emit('update:visible', false)
</script>

<template>
  <a-modal
    :open="props.visible"
    title="导入文件原始数据"
    :width="720"
    :footer="null"
    @cancel="handleClose"
  >
    <a-alert
      class="raw-hint"
      type="info"
      show-icon
      message="原始数据只读保存，不会随标准化字段编辑而改变。"
    />
    <pre class="raw-data">{{ JSON.stringify(props.rawData, null, 2) }}</pre>
  </a-modal>
</template>

<style scoped lang="less">
.raw-hint {
  margin-bottom: 16px;
}

.raw-data {
  max-height: 520px;
  padding: 16px;
  margin: 0;
  overflow: auto;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
