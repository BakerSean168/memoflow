<template>
  <v-chart
    class="mb-6 h-75 min-h-62.5 w-full overflow-hidden rounded-2xl"
    :option="weightOption"
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

use([TitleComponent, TooltipComponent, LegendComponent, PieChart, CanvasRenderer]);

const { t } = useI18n();

const props = defineProps<{
  goal: GoalClientDTO | null;
}>();

const surfaceColor = 'transparent';
const fontColor = '#64748b';

const keyResults = computed(() => props.goal?.keyResults || []);

// 计算权重分布
const weightData = computed(() => {
  const totalWeight = keyResults.value.reduce((sum, kr) => sum + (kr.weight || 0), 0);

  return keyResults.value.map((kr) => {
    const weight = kr.weight || 0;
    const percentage = totalWeight > 0 ? ((weight / totalWeight) * 100).toFixed(1) : '0';
    return {
      name: kr.title,
      value: weight,
      percentage,
      totalWeight,
    };
  });
});

const weightOption = computed(() => {
  const data = weightData.value;
  const totalWeight = data.length > 0 ? data[0].totalWeight : 0;

  return {
    backgroundColor: surfaceColor,
    title: {
      text: t('goal.chart.krWeightDistribution.title'),
      subtext: `${t('goal.chart.krWeightDistribution.subtextPrefix')}${totalWeight}`,
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
        const item = data[params.dataIndex];
        return `
          <div style="font-weight: bold; margin-bottom: 4px;">${params.name}</div>
          <div>${t('goal.chart.krWeightDistribution.tooltipWeight')} ${item.value}/5</div>
          <div>${t('goal.chart.krWeightDistribution.tooltipPercent')} ${item.percentage}%</div>
        `;
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
        name: t('goal.chart.krWeightDistribution.seriesName'),
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
            fontSize: 16,
            fontWeight: 'bold',
            formatter: (params: ECElementEvent) => {
              const item = data[params.dataIndex];
              return `${params.name}\n${t('goal.chart.krWeightDistribution.tooltipWeight')} ${item.value}\n${t('goal.chart.krWeightDistribution.tooltipPercent')} ${item.percentage}%`;
            },
          },
        },
        labelLine: {
          show: false,
        },
        data: data.map((item, index) => ({
          value: item.value,
          name: item.name,
          itemStyle: {
            color: [
              '#5470c6',
              '#91cc75',
              '#fac858',
              '#ee6666',
              '#73c0de',
              '#3ba272',
              '#fc8452',
              '#9a60b4',
              '#ea7ccc',
            ][index % 9],
          },
        })),
      },
    ],
  };
});
</script>
