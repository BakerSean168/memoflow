<template>
  <article
    class="group border-b border-[hsl(var(--border-subtle))] last:border-b-0"
    data-testid="task-occurrence-row"
    :data-occurrence-id="occurrence.id"
    :data-occurrence-status="occurrence.status"
  >
    <div class="flex min-h-14 items-center gap-2 px-2 py-2 pr-3 @md/panel:px-3">
      <Button
        v-if="occurrence.status !== 'Completed'"
        type="button"
        variant="ghost"
        size="icon-sm"
        class="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        :disabled="busy"
        :aria-label="t('task.action.complete')"
        data-testid="task-occurrence-complete"
        @click="emit('complete', String(occurrence.id))"
      >
        <Circle class="h-4 w-4" />
      </Button>
      <Button
        v-else
        type="button"
        variant="ghost"
        size="icon-sm"
        class="h-8 w-8 shrink-0 rounded-full text-foreground"
        :disabled="busy"
        :aria-label="t('task.action.undoComplete')"
        data-testid="task-occurrence-uncomplete"
        @click="emit('uncomplete', String(occurrence.id))"
      >
        <CircleCheck class="h-4 w-4" />
      </Button>

      <button
        type="button"
        class="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
        :aria-label="t('task.occurrence.openPlan', { title: template.name })"
        @click="emit('open-plan', String(template.id))"
      >
        <div class="flex min-w-0 items-center gap-2">
          <h3
            class="min-w-0 truncate text-sm font-medium text-foreground"
            :class="{ 'line-through text-muted-foreground': occurrence.status === 'Completed' }"
          >
            {{ template.name }}
          </h3>
          <Badge
            v-if="isOverdue || occurrence.status !== 'Pending'"
            :variant="isOverdue ? 'destructive' : statusVariant"
            class="h-5 shrink-0 px-1.5 py-0 text-[10px] font-normal"
          >
            {{ statusLabel }}
          </Badge>
          <Badge
            v-if="template.goalBinding"
            variant="outline"
            class="hidden h-5 shrink-0 px-1.5 py-0 text-[10px] font-normal @xl/panel:inline-flex"
          >
            {{ t('task.occurrence.goalLinked') }}
          </Badge>
        </div>
        <div class="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
          <span class="shrink-0">{{ scheduleLabel }}</span>
          <template v-if="position">
            <span aria-hidden="true">·</span>
            <span class="shrink-0">
              {{
                t('task.occurrence.repeatPosition', {
                  position: position.position,
                  total: position.total,
                })
              }}
            </span>
          </template>
          <template v-else-if="template.schedule.kind === 'Recurring'">
            <span aria-hidden="true">·</span>
            <span class="shrink-0">{{ t('task.occurrence.recurring') }}</span>
          </template>
          <template v-if="template.labels.length">
            <span aria-hidden="true">·</span>
            <span class="min-w-0 truncate">
              {{ template.labels.map((label) => `#${label.name}`).join(' ') }}
            </span>
          </template>
        </div>
      </button>

      <div
        class="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
        data-testid="task-occurrence-actions"
      >
        <Button
          v-if="occurrence.status === 'Pending' || occurrence.status === 'InProgress'"
          type="button"
          size="icon-sm"
          variant="ghost"
          class="h-8 w-8 text-muted-foreground"
          :disabled="busy"
          :aria-label="t('task.occurrence.markMissed')"
          data-testid="task-occurrence-missed"
          @click="emit('missed', String(occurrence.id))"
        >
          <ClockAlert class="h-4 w-4" />
        </Button>
        <Button
          v-if="occurrence.status === 'Pending' || occurrence.status === 'InProgress'"
          type="button"
          size="icon-sm"
          variant="ghost"
          class="h-8 w-8 text-muted-foreground"
          :disabled="busy"
          :aria-label="t('task.action.skip')"
          data-testid="task-occurrence-skip"
          @click="emit('skip', String(occurrence.id))"
        >
          <SkipForward class="h-4 w-4" />
        </Button>
      </div>
    </div>

    <div
      v-if="occurrence.checklistState.length"
      class="border-t border-border/50 py-2 pl-12 pr-3"
      data-testid="task-occurrence-checklist"
    >
      <div class="grid gap-x-6 gap-y-1 @2xl/panel:grid-cols-2">
        <label
          v-for="item in occurrence.checklistState"
          :key="item.definitionId"
          class="flex min-w-0 items-center gap-2 py-1 text-sm"
        >
          <Checkbox
            :model-value="item.completed"
            :disabled="busy"
            :aria-label="item.titleSnapshot"
            :data-testid="`task-occurrence-checklist-${item.definitionId}`"
            @update:model-value="
              emit(
                'checklist-change',
                String(occurrence.id),
                item.definitionId,
                Boolean($event),
                occurrence.version,
              )
            "
          />
          <span
            class="min-w-0 truncate"
            :class="{ 'text-muted-foreground line-through': item.completed }"
          >
            {{ item.titleSnapshot }}
          </span>
        </label>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Badge, Button, Checkbox } from '@memoflow/ui-vue-shadcn';
import { Circle, CircleCheck, ClockAlert, SkipForward } from '@lucide/vue';
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
  'open-plan': [planId: string];
  complete: [occurrenceId: string];
  uncomplete: [occurrenceId: string];
  missed: [occurrenceId: string];
  skip: [occurrenceId: string];
  'checklist-change': [
    occurrenceId: string,
    definitionId: string,
    completed: boolean,
    expectedVersion: number,
  ];
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
