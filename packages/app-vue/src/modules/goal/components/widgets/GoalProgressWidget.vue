<script setup lang="ts">
/**
 * GoalProgressWidget — 活跃目标进度列表
 *
 * Goal-owned Home progress widget, shared by the Home and AI surfaces.
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
import type  { GoalHomeProgressItem } from '@memoflow/goal-contracts';

withDefaults(
  defineProps<{
    goals: GoalHomeProgressItem[];
    loading?: boolean;
    error?: string | null;
  }>(),
  { loading: false, error: null },
);

defineEmits<{
  'view-all': [];
  select: [id: string];
  retry: [];
}>();

const { t } = useI18n();
</script>

<template>
  <Card
    class="rounded-xl border-transparent bg-[hsl(var(--surface-raised)/0.56)] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.72),inset_0_1px_0_hsl(var(--foreground)/0.02)]"
    data-testid="goal-progress-widget"
  >
    <CardHeader class="flex flex-row items-center justify-between px-3.5 pb-2 pt-3.5">
      <CardTitle class="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <Target class="h-3.5 w-3.5 text-[hsl(var(--foreground-subtle))]" />
        {{ t('goal.homeProgress.title') }}
      </CardTitle>
      <Button
        variant="ghost"
        size="sm"
        class="h-6 rounded-md px-1.5 text-[11px] text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--hover))] hover:text-foreground"
        @click="$emit('view-all')"
      >
        {{ t('goal.homeProgress.viewAll') }}
        <ArrowRight class="w-3 h-3 ml-1" />
      </Button>
    </CardHeader>
    <CardContent class="px-3.5 pb-3.5">
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
            class="w-full space-y-1.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-[hsl(var(--hover))]"
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
                >{{ goal.progress }}%</span
              >
            </div>
            <Progress :model-value="goal.progress" class="h-1.5" />
          </button>
        </div>
      </template>
      <p v-else-if="!error" class="py-6 text-center text-xs text-muted-foreground">
        {{ t('goal.homeProgress.empty') }}
      </p>
      <div
        v-if="!loading && error"
        class="flex min-h-8 items-center gap-2"
        :class="goals.length ? 'mt-2 border-t border-[hsl(var(--border-subtle)/0.6)] pt-2' : 'py-4'"
        data-testid="goal-progress-error"
        role="alert"
      >
        <p class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {{ t('goal.homeProgress.loadError') }}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-7 shrink-0 rounded-md px-2 text-xs text-foreground"
          data-testid="goal-progress-retry"
          @click="$emit('retry')"
        >
          {{ t('goal.homeProgress.retry') }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
