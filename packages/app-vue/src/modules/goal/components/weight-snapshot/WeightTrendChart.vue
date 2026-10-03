<template>
  <div class="w-full">
    <Card class="border-0 bg-transparent shadow-none">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 px-0 pb-2 pt-0">
        <CardTitle class="text-base">{{ t('goal.weightTrend.title') }}</CardTitle>
        <div class="flex items-center gap-0.5">
          <Button
            v-for="range in timeRanges"
            :key="range.value"
            :variant="selectedRange === range.value ? 'default' : 'ghost'"
            size="sm"
            @click="handleRangeChange(range.value)"
          >
            {{ range.label }}
          </Button>
        </div>
      </CardHeader>

      <CardContent class="px-0 pb-0">
        <!-- 加载状态 -->
        <div v-if="isLoading" class="flex items-center justify-center py-12">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <!-- 空状态 -->
        <Alert v-else-if="!hasTrendData">
          <Info class="h-4 w-4" />
          <AlertDescription>{{ t('goal.weightTrend.empty') }}</AlertDescription>
        </Alert>

        <!-- 图表 -->
        <v-chart
          v-else
          class="w-full min-h-[400px]"
          :option="chartOption"
          autoresize
          style="height: 400px"
        />

        <!-- 图例说明 -->
        <div
          v-if="hasTrendData"
          class="mt-4 flex flex-wrap gap-2 rounded-xl bg-[hsl(var(--surface-raised)/0.28)] p-3 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.4)]"
        >
          <Badge
            v-for="kr in trendData?.keyResults"
            :key="kr.id"
            :style="{
              backgroundColor: getKRColor(kr.id),
              color: '#fff',
              borderColor: getKRColor(kr.id),
            }"
          >
            {{ kr.title }}
          </Badge>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { use } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { formatProductPattern } from '../../../../shared/utils/product-time';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import VChart from 'vue-echarts';
import type { ECElementEvent } from 'echarts';
import { useWeightSnapshot } from '../../composables/useWeightSnapshot';
import { Card, CardHeader, CardTitle, CardContent } from '@memoflow/ui-vue-shadcn';
import { Button } from '@memoflow/ui-vue-shadcn';
import { Alert, AlertDescription } from '@memoflow/ui-vue-shadcn';
import { Badge } from '@memoflow/ui-vue-shadcn';
import { Loader2, Info } from '@lucide/vue';

use([
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  LineChart,
  CanvasRenderer,
]);

const props = defineProps<{
  goalId: string;
}>();

const {
  weightTrend: trendData,
  isFetchingTrend: isLoading,
  hasWeightTrend: hasTrendData,
  fetchWeightTrend,
} = useWeightSnapshot();

const { t } = useI18n();


const selectedRange = ref<'7d' | '30d' | '90d' | '180d'>('30d');

// 时间范围选项
const timeRanges = computed(() => [
  { label: t('goal.weightTrend.range7d'), value: '7d' as const },
  { label: t('goal.weightTrend.range30d'), value: '30d' as const },
  { label: t('goal.weightTrend.range90d'), value: '90d' as const },
  { label: t('goal.weightTrend.range180d'), value: '180d' as const },
]);

// KR 颜色映射
const krColors = [
  '#5470c6',
  '#91cc75',
  '#fac858',
  '#ee6666',
  '#73c0de',
  '#3ba272',
  '#fc8452',
  '#9a60b4',
  '#ea7ccc',
];

const getKRColor = (krId: string) => {
  const index = trendData.value?.keyResults.findIndex((kr) => kr.id === krId) || 0;
  return krColors[index % krColors.length];
};

// ECharts 配置
const chartOption = computed(() => {
  if (!trendData.value) return {};

  const { keyResults } = trendData.value;

  // 构建系列数据
  const series = keyResults.map((kr, index) => ({
    name: kr.title,
    type: 'line',
    smooth: true,
    symbol: 'circle',
    symbolSize: 8,
    lineStyle: {
      width: 2,
    },
    emphasis: {
      focus: 'series',
    },
    data: kr.data.map((point: { time: number; weight: number }) => [point.time, point.weight]),
    itemStyle: {
      color: krColors[index % krColors.length],
    },
  }));

  return {
    title: {
      text: t('goal.weightTrend.chartTitle'),
      left: 'center',
      textStyle: {
        fontSize: 16,
      },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        label: {
          backgroundColor: '#6a7985',
        },
      },
      formatter: (params: ECElementEvent[]) => {
        const firstValue = params[0].value as unknown[];
        const time = formatProductPattern(firstValue[0] as number, 'yyyy-MM-dd HH:mm');
        let html = `<div style="padding: 8px;">
          <div style="font-weight: bold; margin-bottom: 8px;">${time}</div>`;

        params.forEach((param: ECElementEvent) => {
          const val = param.value as unknown[];
          html += `
            <div style="display: flex; align-items: center; margin-bottom: 4px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${param.color}; margin-right: 8px;"></span>
              <span>${param.seriesName}: ${val[1]}%</span>
            </div>`;
        });

        html += '</div>';
        return html;
      },
    },
    legend: {
      data: keyResults.map((kr) => kr.title),
      bottom: 10,
      left: 'center',
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '60px',
      top: '60px',
      containLabel: true,
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      axisLabel: {
        formatter: (value: number) =>
          formatProductPattern(value, 'MM-dd'),
      },
    },
    yAxis: {
      type: 'value',
      name: t('goal.weightTrend.yAxisLabel'),
      min: 0,
      max: 100,
      axisLabel: {
        formatter: '{value}%',
      },
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100,
      },
      {
        type: 'slider',
        start: 0,
        end: 100,
        height: 30,
        bottom: 25,
      },
    ],
    series,
  };
});

// 处理时间范围变化
const handleRangeChange = async (range: typeof selectedRange.value) => {
  selectedRange.value = range;
  await loadTrendData();
};

// 加载趋势数据
const loadTrendData = async () => {
  const now = Date.now();
  const days =
    selectedRange.value === '7d'
      ? 7
      : selectedRange.value === '30d'
        ? 30
        : selectedRange.value === '90d'
          ? 90
          : 180;
  const startTime = now - days * 24 * 60 * 60 * 1000;

  await fetchWeightTrend(props.goalId, startTime, now);
};

// 初始加载
onMounted(() => {
  loadTrendData();
});
</script>
