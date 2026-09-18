<script setup lang="ts">
/**
 * GoalProgressWidget — 活跃目标进度列表
 *
 * 从 DashboardView 抽出（UI_PAGE_REDESIGN_PLAN §2/§6），落 goal 模块 widgets，
 * 与 task/reminder 的 widgets 目录约定对齐，供仪表盘与 AI 首页右栏复用。
 * 纯展示：数据由父级传入，不自取数（布局层不直连数据源）。
 */
import { useI18n } from 'vue-i18n';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
  Skeleton,
  Button,
} from '@memoflow/ui-vue-shadcn';
import { Target, ArrowRight } from '@lucide/vue';
import type { GoalHomeProgressItem } from '@memoflow/contracts/goal';

withDefaults(
  defineProps<{
    goals: GoalHomeProgressItem[];
    loading?: boolean;
  }>(),
  { loading: false },
);

defineEmits<{
  'view-all': [];
  select: [id: string];
}>();

const { t } = useI18n();
</script>

<template>
  <Card class="border-border/50" data-testid="goal-progress-widget">
    <CardHeader class="pb-2 px-4 pt-4 flex flex-row items-center justify-between">
      <CardTitle class="text-sm font-medium text-foreground flex items-center gap-2">
        <Target class="w-4 h-4 text-muted-foreground" />
        {{ t('dashboard.goalProgress.title') }}
      </CardTitle>
      <Button variant="ghost" size="sm" class="h-7 text-xs" @click="$emit('view-all')">
        {{ t('dashboard.viewAll') }}
        <ArrowRight class="w-3 h-3 ml-1" />
      </Button>
    </CardHeader>
    <CardContent class="px-4 pb-4">
      <template v-if="loading">
        <div class="space-y-4">
          <div v-for="i in 4" :key="i" class="space-y-1.5">
            <Skeleton class="h-3 w-32" />
            <Skeleton class="h-2 w-full" />
          </div>
        </div>
      </template>
      <template v-else-if="goals.length">
        <div class="space-y-3">
          <button
            v-for="goal in goals"
            :key="goal.id"
            type="button"
            class="w-full space-y-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/50"
            data-testid="goal-progress-item"
            :data-goal-id="goal.id"
            @click="$emit('select', goal.id)"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs text-foreground font-medium truncate max-w-[60%]">
                {{ goal.name }}
              </span>
              <span
                class="text-[11px] text-muted-foreground font-mono"
                data-testid="goal-progress-value"
              >{{ goal.progress }}%</span>
            </div>
            <Progress :model-value="goal.progress" class="h-1.5" />
          </button>
        </div>
      </template>
      <p v-else class="py-6 text-center text-xs text-muted-foreground">
        {{ t('dashboard.goalProgress.empty') }}
      </p>
    </CardContent>
  </Card>
</template>
