<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { BarChart, HeatmapChart, LineChart, PieChart } from 'echarts/charts'
import {
  AriaComponent,
  CalendarComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import { init, use, type EChartsCoreOption, type EChartsType } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

interface Props {
  option: EChartsCoreOption
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  height: '320px',
})

use([
  LineChart,
  BarChart,
  PieChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CalendarComponent,
  VisualMapComponent,
  AriaComponent,
  CanvasRenderer,
])

const ChartRef = ref<HTMLDivElement | null>(null)
const chartInstance = shallowRef<EChartsType | null>(null)
const resizeObserver = shallowRef<ResizeObserver | null>(null)
const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

const updateChart = () => {
  chartInstance.value?.setOption(
    {
      ...props.option,
      animation: !reduceMotionQuery.matches,
    },
    {
      notMerge: true,
      lazyUpdate: true,
    },
  )
}

const initializeChart = () => {
  if (!ChartRef.value || chartInstance.value) return

  chartInstance.value = init(ChartRef.value, undefined, { renderer: 'canvas' })
  updateChart()
  resizeObserver.value = new ResizeObserver(() => chartInstance.value?.resize())
  resizeObserver.value.observe(ChartRef.value)
}

const handleMotionPreferenceChange = () => {
  updateChart()
}

watch(
  () => props.option,
  () => updateChart(),
)

onMounted(() => {
  initializeChart()
  reduceMotionQuery.addEventListener('change', handleMotionPreferenceChange)
})

onBeforeUnmount(() => {
  reduceMotionQuery.removeEventListener('change', handleMotionPreferenceChange)
  resizeObserver.value?.disconnect()
  resizeObserver.value = null
  chartInstance.value?.dispose()
  chartInstance.value = null
})
</script>

<template>
  <div ref="ChartRef" class="base-chart-wrapper" :style="{ height: props.height }"></div>
</template>

<style scoped lang="less">
.base-chart-wrapper {
  width: 100%;
  min-height: 240px;
}
</style>
