<template>
  <article
    class="group border-b border-border/70 px-1 py-4 last:border-b-0"
    data-testid="goal-progress-row"
    :data-goal-id="goal.id"
  >
    <div class="flex items-start gap-3">
      <button type="button" class="min-w-0 flex-1 text-left" @click="emit('view')">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="truncate text-sm font-medium text-foreground" data-testid="goal-row-title">
                {{ goal.name }}
              </h3>
              <Badge
                v-if="statusLabel"
                :variant="statusVariant"
                class="h-5 px-1.5 py-0 text-[10px]"
              >
                {{ statusLabel }}
              </Badge>
            </div>
            <div
              class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
            >
              <template v-for="label in goal.labels" :key="label.id">
                <span class="inline-flex items-center gap-1">
                  <span
                    v-if="label.color"
                    class="h-2 w-2 rounded-full border border-border"
                    :style="{ backgroundColor: label.color }"
                    aria-hidden="true"
                  />
                  #{{ label.name }}
                </span>
              </template>
              <span v-if="dateRangeText">{{ dateRangeText }}</span>
            </div>
          </div>
          <span class="shrink-0 text-sm font-semibold tabular-nums">{{ progress }}%</span>
        </div>
        <Progress :model-value="progress" class="mt-3 h-1.5" />
        <div class="mt-2 text-xs text-muted-foreground">
          {{
            t('goal.cards.keyResultsCount', {
              done: goal.completedKeyResults,
              total: goal.totalKeyResults,
            })
          }}
        </div>
      </button>

      <div
        class="flex shrink-0 items-center gap-1 opacity-100 @2xl/panel:opacity-0 @2xl/panel:transition-opacity @2xl/panel:group-hover:opacity-100 @2xl/panel:group-focus-within:opacity-100"
      >
        <Button variant="ghost" size="xs" :aria-label="t('common.edit')" @click="emit('edit')">
          {{ t('common.edit') }}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          class="text-destructive hover:text-destructive"
          :aria-label="t('common.delete')"
          @click="emit('delete')"
        >
          {{ t('common.delete') }}
        </Button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { GoalClientDTO } from '@memoflow/contracts/goal';
import { Badge, Button, Progress } from '@memoflow/ui-vue-shadcn';
import { endOfDayMs, formatProductDate } from '../../../shared/utils/product-time';
import { getGoalOverallProgress } from '../utils/progress';

const props = defineProps<{ goal: GoalClientDTO }>();
const emit = defineEmits<{ view: []; edit: []; delete: [] }>();
const { t } = useI18n();

const progress = computed(() => getGoalOverallProgress(props.goal));
const isOverdue = computed(
  () =>
    props.goal.status === 'InProgress' &&
    props.goal.dueDate != null &&
    endOfDayMs(props.goal.dueDate) < Date.now(),
);
const statusLabel = computed(() => {
  if (isOverdue.value) return t('goal.list.overdue');
  if (props.goal.status === 'Completed') return t('goal.list.completed');
  if (props.goal.status === 'Abandoned') return t('goal.list.abandoned');
  return '';
});
const statusVariant = computed<'secondary' | 'destructive'>(() =>
  isOverdue.value ? 'destructive' : 'secondary',
);
const dateRangeText = computed(() => {
  if (props.goal.startDate != null && props.goal.dueDate != null) {
    return `${formatProductDate(props.goal.startDate)} → ${formatProductDate(props.goal.dueDate)}`;
  }
  if (props.goal.dueDate != null)
    return `${t('goal.list.due')} ${formatProductDate(props.goal.dueDate)}`;
  if (props.goal.startDate != null)
    return `${t('goal.list.from')} ${formatProductDate(props.goal.startDate)}`;
  return '';
});
</script>
