<template>
  <div
    :class="[
      'flex items-center gap-3 p-4 min-h-[64px] transition-all duration-200 hover:bg-muted/50 group',
      { 'border-b border-border': showBorder, 'opacity-60': isCompleted },
    ]"
  >
    <!-- Completion Checkbox/Button -->
    <Button
      variant="ghost"
      size="icon"
      :aria-label="isCompleted ? t('task.action.undoComplete') : t('task.action.complete')"
      class="h-5 w-5 shrink-0 rounded-full p-0 hover:bg-transparent text-muted-foreground hover:text-primary transition-colors"
      @click="toggleComplete"
    >
      <CheckCircle2 v-if="isCompleted" class="h-5 w-5 text-primary" />
      <Circle v-else class="h-5 w-5" />
    </Button>

    <div class="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
      <!-- Title -->
      <h3
        :class="[
          'text-sm font-medium leading-normal truncate transition-colors',
          { 'line-through text-muted-foreground': isCompleted, 'text-foreground': !isCompleted },
        ]"
      >
        {{ taskTitle }}
      </h3>

      <!-- Metadata -->
      <div class="flex items-center gap-2 text-xs text-muted-foreground">
        <component :is="isCompleted ? Check : Clock" class="h-3 w-3" />
        <span v-if="!isCompleted">{{ timeLabel }}</span>
        <span v-else>{{ t('task.instanceCard.completedAt', { time: formatCompletionTime }) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import { CheckCircle2, Circle, Clock, Check } from '@lucide/vue';
import type { TaskOccurrenceViewModel } from './types';
import { formatHHmmParts } from '../../../shared/utils/format-hhmm-parts';
import { formatProductHm } from '../../../shared/utils/product-time';

// Props
const props = withDefaults(
  defineProps<{
    task: TaskOccurrenceViewModel;
    showBorder?: boolean;
    taskTitle?: string;
  }>(),
  {
    showBorder: true,
  },
);

const { t } = useI18n();

// Emits
const emit = defineEmits<{
  complete: [id: string];
  undo: [id: string];
}>();

// Store - TODO: Connect to new domain model
// const taskStore = useTaskStore();

// Computed
const isCompleted = computed(() => props.task.isCompleted);

const taskTitle = computed(() => {
  return props.taskTitle || props.task.templateTitle || t('task.rootInstanceCard.taskFallback');
});

const formatCompletionTime = computed(() => {
  return props.task.actualEndTime ? formatProductHm(props.task.actualEndTime) : '';
});

/** Residual 1297: minutes-of-day HH:mm dual retired onto formatHHmmParts sole. */
const timeLabel = computed(() => {
  const timeConfig = props.task.timeConfig;

  if (timeConfig?.timeType === 'AllDay') {
    return t('task.templateCard.allDay');
  }

  if (timeConfig?.timeType === 'TimePoint' && typeof timeConfig.timePoint === 'number') {
    const hours = Math.floor(timeConfig.timePoint / 60);
    const minutes = timeConfig.timePoint % 60;
    return formatHHmmParts(hours, minutes);
  }

  if (timeConfig?.timeType === 'TimeRange' && timeConfig.timeRange) {
    const startHours = Math.floor(timeConfig.timeRange.start / 60);
    const startMinutes = timeConfig.timeRange.start % 60;
    const endHours = Math.floor(timeConfig.timeRange.end / 60);
    const endMinutes = timeConfig.timeRange.end % 60;

    return `${formatHHmmParts(startHours, startMinutes)} - ${formatHHmmParts(endHours, endMinutes)}`;
  }

  return t('task.templateCard.allDay');
});

const toggleComplete = () => {
  if (isCompleted.value) {
    emit('undo', props.task.id);
    return;
  }
  emit('complete', props.task.id);
};
</script>
