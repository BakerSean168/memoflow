<template>
  <article
    class="group rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-muted/20"
    data-testid="task-occurrence-row"
    :data-occurrence-id="occurrence.id"
    :data-occurrence-status="occurrence.status"
  >
    <div class="flex min-w-0 flex-col gap-3 @2xl/panel:flex-row @2xl/panel:items-center">
      <button
        type="button"
        class="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="t('task.occurrence.openPlan', { title: template.name })"
        @click="emit('open-plan', String(template.id))"
      >
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <h3
            class="truncate text-sm font-semibold text-foreground"
            :class="{ 'line-through text-muted-foreground': occurrence.status === 'Completed' }"
          >
            {{ template.name }}
          </h3>
          <Badge :variant="isOverdue ? 'destructive' : statusVariant">
            {{ statusLabel }}
          </Badge>
          <Badge v-if="template.goalBinding" variant="outline">
            {{ t('task.occurrence.goalLinked') }}
          </Badge>
        </div>
        <p class="mt-1 text-xs text-muted-foreground">{{ scheduleLabel }}</p>
        <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span v-if="position">
            {{
              t('task.occurrence.repeatPosition', {
                position: position.position,
                total: position.total,
              })
            }}
          </span>
          <span v-else-if="template.schedule.kind === 'Recurring'">{{
            t('task.occurrence.recurring')
          }}</span>
          <span v-if="template.labels.length">{{
            template.labels.map((label) => label.name).join(' · ')
          }}</span>
        </div>
      </button>

      <div class="flex shrink-0 flex-wrap items-center gap-2" data-testid="task-occurrence-actions">
        <Button
          v-if="occurrence.status !== 'Completed'"
          size="sm"
          :disabled="busy"
          :aria-label="t('task.action.complete')"
          data-testid="task-occurrence-complete"
          @click="emit('complete', String(occurrence.id))"
        >
          <Check class="mr-1.5 h-4 w-4" />
          {{ t('task.action.complete') }}
        </Button>
        <Button
          v-else
          size="sm"
          variant="outline"
          :disabled="busy"
          :aria-label="t('task.action.undoComplete')"
          data-testid="task-occurrence-uncomplete"
          @click="emit('uncomplete', String(occurrence.id))"
        >
          <Undo2 class="mr-1.5 h-4 w-4" />
          {{ t('task.action.undoComplete') }}
        </Button>
        <Button
          v-if="occurrence.status === 'Pending' || occurrence.status === 'InProgress'"
          size="sm"
          variant="outline"
          :disabled="busy"
          data-testid="task-occurrence-missed"
          @click="emit('missed', String(occurrence.id))"
        >
          <ClockAlert class="mr-1.5 h-4 w-4" />
          {{ t('task.occurrence.markMissed') }}
        </Button>
        <Button
          v-if="occurrence.status === 'Pending' || occurrence.status === 'InProgress'"
          size="sm"
          variant="ghost"
          :disabled="busy"
          data-testid="task-occurrence-skip"
          @click="emit('skip', String(occurrence.id))"
        >
          <SkipForward class="mr-1.5 h-4 w-4" />
          {{ t('task.action.skip') }}
        </Button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Badge, Button } from '@memoflow/ui-vue-shadcn';
import { Check, ClockAlert, SkipForward, Undo2 } from '@lucide/vue';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import {
  getTaskOccurrenceScheduleLabel,
  getTaskOccurrenceStatusLabel,
  isTaskOccurrenceOverdue,
} from '../utils/task-occurrence-presentation';

const props = withDefaults(
  defineProps<{
    occurrence: TaskOccurrenceClientDTO;
    template: TaskPlanClientDTO;
    position?: { position: number; total: number } | null;
    busy?: boolean;
    now?: number;
  }>(),
  { position: null, busy: false, now: undefined },
);

const emit = defineEmits<{
  'open-plan': [templateId: string];
  complete: [instanceId: string];
  uncomplete: [instanceId: string];
  missed: [instanceId: string];
  skip: [instanceId: string];
}>();

const { t } = useI18n();
const effectiveNow = computed(() => props.now ?? Date.now());
const isOverdue = computed(() => isTaskOccurrenceOverdue(props.occurrence, effectiveNow.value));
const statusLabel = computed(() =>
  getTaskOccurrenceStatusLabel(t, props.occurrence, effectiveNow.value),
);
const scheduleLabel = computed(() => getTaskOccurrenceScheduleLabel(t, props.occurrence));
const statusVariant = computed(() => {
  if (props.occurrence.status === 'Completed') return 'default';
  if (props.occurrence.status === 'Missed') return 'destructive';
  return 'secondary';
});
</script>
