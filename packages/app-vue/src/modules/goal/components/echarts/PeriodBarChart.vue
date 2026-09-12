<template>
  <v-chart
    class="mb-6 h-55 min-h-45 w-full overflow-hidden rounded-2xl"
    :option="periodBarOption"
    autoresize
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent, GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECElementEvent } from 'echarts';
import type { GoalClientDTO, GoalRecordClientDTO } from '@memoflow/contracts/goal';
import { getProductTime, productTimeRevision } from '../../../../shared/utils/product-time';

use([TitleComponent, TooltipComponent, GridComponent, BarChart, CanvasRenderer]);

const { t } = useI18n();

type GoalWithRecords = GoalClientDTO & {
  records?: GoalRecordClientDTO[] | null;
};

const props = defineProps<{
  goal: GoalWithRecords | null;
}>();

const surfaceColor = 'transparent';
const fontColor = '#64748b';

type TimePeriod = '早晨' | '下午' | '晚上' | '凌晨';
const timePeriods: TimePeriod[] = ['早晨', '下午', '晚上', '凌晨'];

function classifyGoalRecordsByPeriod(records: GoalRecordClientDTO[]): Record<TimePeriod, number> {
  const stat: Record<TimePeriod, number> = {
    早晨: 0,
    下午: 0,
    晚上: 0,
    凌晨: 0,
  };
  for (const rec of records) {
    if (!rec || !rec.createdAt) {
      continue;
    }

    try {
      const timestamp =
        typeof rec.createdAt === 'number' ? rec.createdAt : Date.parse(String(rec.createdAt));
      if (!Number.isFinite(timestamp)) continue;

      const period = getTimePeriod(timestamp);
      stat[period]++;
    } catch {
      continue;
    }
  }
  return stat;
}

function getTimePeriod(timestamp: number): TimePeriod {
  const hour = Number(String(getProductTime().input.timeValue(timestamp)).slice(0, 2));
  if (hour >= 6 && hour < 12) return '早晨';
  if (hour >= 12 && hour < 18) return '下午';
  if (hour >= 18 && hour < 24) return '晚上';
  return '凌晨';
}

const translatedTimePeriods = computed(() => [
  t('goal.chart.periodBar.morning'),
  t('goal.chart.periodBar.afternoon'),
  t('goal.chart.periodBar.evening'),
  t('goal.chart.periodBar.lateNight'),
]);

const periodBarOption = computed(() => {
  void productTimeRevision.value;
  const records = props.goal?.records ?? [];
  const stat = classifyGoalRecordsByPeriod(records);
  const dataArr = timePeriods.map((period) => stat[period]);

  const max = Math.max(...dataArr);
  const min = Math.min(...dataArr);
  const maxIdx = dataArr.indexOf(max);
  const minIdx = dataArr.indexOf(min);

  return {
    backgroundColor: surfaceColor,
    title: {
      text: t('goal.chart.periodBar.title'),
      left: 'center',
      top: 10,
      textStyle: { fontSize: 16 },
    },
    tooltip: {
      backgroundColor: surfaceColor,
      borderColor: 'transparent',
      textStyle: {
        color: fontColor,
        fontSize: 14,
      },
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    xAxis: {
      type: 'category',
      data: translatedTimePeriods.value,
      axisLabel: { fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    series: [
      {
        name: t('goal.chart.periodBar.seriesName'),
        type: 'bar',
        data: dataArr,
        itemStyle: {
          color: (params: ECElementEvent) => {
            if (params.dataIndex === maxIdx) return '#52c41a'; // 绿色
            if (params.dataIndex === minIdx) return '#ff4d4f'; // 红色
            return '#5470C6'; // 其他
          },
          borderRadius: [8, 8, 8, 8],
        },
        barWidth: 50,
        label: {
          show: true,
          position: 'top',
          formatter: '{c}',
          fontSize: 12,
          color: fontColor,
        },
      },
    ],
    grid: { left: 40, right: 30, top: 50, bottom: 30 },
  };
});
</script>
