<template>
  <div
    class="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-4"
    data-testid="task-workflow-draft-editor"
  >
    <div class="flex items-center justify-between gap-3">
      <p class="text-[10px] font-mono text-muted-foreground">{{ task.draftRef }}</p>
      <span class="rounded-full border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        {{ task.schedule.kind }}
      </span>
    </div>

    <Input
      :model-value="task.title"
      :placeholder="t('aiAssistant.goalDraft.taskName')"
      @update:model-value="updateTask({ title: String($event ?? '') })"
    />
    <Textarea
      class="min-h-20"
      :model-value="task.description ?? ''"
      :placeholder="t('aiAssistant.goalDraft.taskDescription')"
      @update:model-value="updateTask({ description: String($event ?? '') || null })"
    />

    <div class="grid gap-3 @sm/ai:grid-cols-2">
      <div class="grid gap-2">
        <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {{ t('aiAssistant.goalDraft.importance') }}
        </p>
        <Select
          :model-value="task.importance"
          @update:model-value="updateTask({ importance: $event as TaskPlanTask['importance'] })"
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in importanceOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="rounded-xl border bg-background/70 p-3 text-sm text-muted-foreground">
        <p class="text-[10px] uppercase tracking-[0.16em]">
          {{ t('aiAssistant.goalDraft.schedule') }}
        </p>
        <p class="mt-1 text-foreground">{{ formatTaskSchedule(task) }}</p>
      </div>
    </div>

    <p v-if="task.goalBinding" class="text-xs text-muted-foreground">
      {{ task.goalBinding.goalId
      }}<span v-if="task.goalBinding.keyResultId"> → {{ task.goalBinding.keyResultId }}</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@memoflow/ui-vue-shadcn';
import type { TaskPlanTask } from '@memoflow/contracts/ai';

const props = defineProps<{ task: TaskPlanTask }>();
const emit = defineEmits<{ 'update-task': [task: TaskPlanTask] }>();
const { t } = useI18n();

const importanceOptions = computed(() => [
  { value: 'Vital', label: t('aiAssistant.goalDraft.importanceLevels.vital') },
  { value: 'Important', label: t('aiAssistant.goalDraft.importanceLevels.important') },
  { value: 'Moderate', label: t('aiAssistant.goalDraft.importanceLevels.moderate') },
  { value: 'Minor', label: t('aiAssistant.goalDraft.importanceLevels.minor') },
  { value: 'Trivial', label: t('aiAssistant.goalDraft.importanceLevels.trivial') },
]);

function updateTask(patch: Partial<TaskPlanTask>): void {
  emit('update-task', { ...props.task, ...patch });
}

function formatTaskSchedule(task: TaskPlanTask): string {
  const schedule = task.schedule;
  const timing =
    schedule.timing.kind === 'AllDay'
      ? t('aiAssistant.goalDraft.allDay')
      : schedule.timing.kind === 'At'
        ? schedule.timing.time
        : `${schedule.timing.start}–${schedule.timing.end}`;
  if (schedule.kind === 'OneTime') return `${schedule.date} · ${timing}`;
  return `${schedule.startDate} · ${schedule.recurrence.frequency} ×${schedule.recurrence.interval} · ${timing}`;
}
</script>
