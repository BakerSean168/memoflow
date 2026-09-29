<template>
  <article
    class="group rounded-lg transition-colors hover:bg-[hsl(var(--hover)/0.55)]"
    :class="{ 'opacity-60': terminal && occurrence.status !== 'Completed' }"
    :data-testid="`task-compact-occurrence-${occurrence.id}`"
  >
    <div class="flex min-h-10 items-start gap-2 px-1.5 py-1.5">
      <button
        type="button"
        class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[hsl(var(--hover))] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="busy || occurrence.status === 'Skipped' || occurrence.status === 'Missed'"
        :aria-label="
          occurrence.status === 'Completed'
            ? t('task.action.undoComplete')
            : t('task.action.complete')
        "
        :data-testid="`task-compact-complete-${occurrence.id}`"
        @click.stop="toggleComplete"
      >
        <Loader2 v-if="busy" class="h-4 w-4 animate-spin" />
        <CircleCheck
          v-else-if="occurrence.status === 'Completed'"
          class="h-4 w-4 text-emerald-500"
        />
        <Circle v-else class="h-4 w-4" />
      </button>

      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <button
            type="button"
            class="min-w-0 flex-1 truncate rounded-sm text-left text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
            :class="{ 'line-through text-muted-foreground': occurrence.status === 'Completed' }"
            :aria-label="template.name"
            @click="emit('open-plan', String(template.id))"
          >
            {{ template.name }}
          </button>
          <span
            class="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground"
            :data-testid="`task-compact-time-${occurrence.id}`"
          >
            {{ timeLabel }}
          </span>
        </div>

        <div
          v-if="occurrence.checklistState.length"
          class="mt-0.5 flex min-w-0 items-center justify-between gap-2"
        >
          <button
            type="button"
            class="flex min-w-0 items-center gap-1 rounded px-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            :aria-expanded="checklistOpen"
            :data-testid="`task-compact-checklist-toggle-${occurrence.id}`"
            @click.stop="checklistOpen = !checklistOpen"
          >
            <ChevronRight
              class="h-3 w-3 shrink-0 transition-transform"
              :class="{ 'rotate-90': checklistOpen }"
            />
            <span>
              {{ t('task.checklist.title') }} {{ checklistCompleted }}/{{
                occurrence.checklistState.length
              }}
            </span>
          </button>
        </div>
      </div>

      <div
        class="flex h-6 w-6 shrink-0 items-center justify-center"
        :data-testid="`task-compact-action-slot-${occurrence.id}`"
      >
        <button
          v-if="occurrence.status === 'Pending' || occurrence.status === 'InProgress'"
          type="button"
          class="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-[hsl(var(--hover))] hover:text-foreground group-hover:opacity-100 focus:opacity-100"
          :aria-label="t('task.action.skip')"
          :title="t('task.action.skip')"
          :disabled="busy"
          @click.stop="emit('skip', String(occurrence.id))"
        >
          <SkipForward class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <div
      v-if="checklistOpen && occurrence.checklistState.length"
      class="ml-9 mr-2 border-l border-[hsl(var(--border-subtle))] pb-1.5 pl-2"
      :data-testid="`task-compact-checklist-${occurrence.id}`"
    >
      <label
        v-for="item in occurrence.checklistState"
        :key="item.definitionId"
        class="flex min-w-0 items-center gap-2 rounded px-1 py-1 text-[11px] hover:bg-[hsl(var(--hover)/0.5)]"
      >
        <Checkbox
          :model-value="item.completed"
          :disabled="busy || terminal"
          :aria-label="item.titleSnapshot"
          :data-testid="`task-compact-checklist-item-${item.definitionId}`"
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
          class="min-w-0 flex-1 truncate"
          :class="{ 'line-through text-muted-foreground': item.completed }"
        >
          {{ item.titleSnapshot }}
        </span>
      </label>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Checkbox } from '@memoflow/ui-vue-shadcn';
import { ChevronRight, Circle, CircleCheck, Loader2, SkipForward } from '@lucide/vue';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';

const props = defineProps<{
  occurrence: TaskOccurrenceClientDTO;
  template: TaskPlanClientDTO;
  busy?: boolean;
}>();

const emit = defineEmits<{
  'open-plan': [planId: string];
  complete: [occurrenceId: string];
  uncomplete: [occurrenceId: string];
  skip: [occurrenceId: string];
  'checklist-change': [
    occurrenceId: string,
    definitionId: string,
    completed: boolean,
    expectedVersion: number,
  ];
}>();

const { t } = useI18n();
const checklistOpen = ref(false);

const terminal = computed(
  () =>
    props.occurrence.status === 'Completed' ||
    props.occurrence.status === 'Skipped' ||
    props.occurrence.status === 'Missed',
);

const checklistCompleted = computed(
  () => props.occurrence.checklistState.filter((item) => item.completed).length,
);

const timeLabel = computed(() => {
  const timing = props.occurrence.scheduleSnapshot.timing;
  if (timing.kind === 'At') return timing.time;
  if (timing.kind === 'Window') return timing.start;
  return t('shell.preview.allDay');
});

function toggleComplete(): void {
  if (props.occurrence.status === 'Completed') {
    emit('uncomplete', String(props.occurrence.id));
    return;
  }
  if (props.occurrence.status === 'Skipped' || props.occurrence.status === 'Missed') return;
  emit('complete', String(props.occurrence.id));
}
</script>
