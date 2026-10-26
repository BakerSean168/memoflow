<template>
  <v-chart
    class="mb-6 h-75 min-h-62.5 w-full overflow-hidden rounded-2xl"
    :option="completionOption"
    autoresize
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECElementEvent } from 'echarts';
import type  { GoalClientDTO } from '@memoflow/goal-contracts';
import { getKeyResultProgressPercentage } from '../../utils/progress';

use([TitleComponent, TooltipComponent, LegendComponent, PieChart, CanvasRenderer]);

const { t } = useI18n();

const props = defineProps<{
  goal: GoalClientDTO | null;
}>();

const surfaceColor = 'transparent';
const fontColor = '#64748b';

const keyResults = computed(() => props.goal?.keyResults || []);

// 计算完成情况统计
const completionStats = computed(() => {
  const total = keyResults.value.length;
  const completed = keyResults.value.filter(
    (kr) => getKeyResultProgressPercentage(kr.progress) >= 100,
  ).length;
  const inProgress = keyResults.value.filter((kr) => {
    const percentage = getKeyResultProgressPercentage(kr.progress);
    return percentage > 0 && percentage < 100;
  }).length;
  const notStarted = keyResults.value.filter(
    (kr) => getKeyResultProgressPercentage(kr.progress) === 0,
  ).length;

  return {
    completed,
    inProgress,
    notStarted,
    total,
    completedRate: total > 0 ? ((completed / total) * 100).toFixed(1) : '0',
  };
});

const completionOption = computed(() => {
  const stats = completionStats.value;

  return {
    backgroundColor: surfaceColor,
    title: {
      text: t('goal.chart.krCompletion.title'),
      subtext: `${t('goal.chart.krCompletion.subtextPrefix')}${stats.completedRate}%`,
      left: 'center',
      top: 10,
      textStyle: { fontSize: 16 },
      subtextStyle: { fontSize: 12, color: fontColor },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: surfaceColor,
      borderColor: 'transparent',
      textStyle: {
        color: fontColor,
        fontSize: 14,
      },
      formatter: (params: ECElementEvent) => {
        const value = Number(params.value ?? 0);
        const percent = ((value / stats.total) * 100).toFixed(1);
        return `${params.name}: ${value}${t('goal.chart.krCompletion.tooltipUnit')} (${percent}%)`;
      },
    },
    legend: {
      orient: 'vertical',
      right: 20,
      top: 'center',
      textStyle: { color: fontColor },
    },
    series: [
      {
        name: t('goal.chart.krCompletion.seriesName'),
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['40%', '55%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: surfaceColor,
          borderWidth: 2,
        },
        label: {
          show: false,
          position: 'center',
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 20,
            fontWeight: 'bold',
            formatter: (params: ECElementEvent) =>
              `${params.name}\n${params.value}${t('goal.chart.krCompletion.tooltipUnit')}`,
          },
        },
        labelLine: {
          show: false,
        },
        data: [
          {
            value: stats.completed,
            name: t('goal.chart.krCompletion.completed'),
            itemStyle: { color: '#52c41a' },
          },
          {
            value: stats.inProgress,
            name: t('goal.chart.krCompletion.inProgress'),
            itemStyle: { color: '#1890ff' },
          },
          {
            value: stats.notStarted,
            name: t('goal.chart.krCompletion.notStarted'),
            itemStyle: { color: '#d9d9d9' },
          },
        ],
      },
    ],
  };
});
</script>
