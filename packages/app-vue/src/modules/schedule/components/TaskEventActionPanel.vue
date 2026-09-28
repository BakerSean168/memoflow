<template>
  <Sheet :open="open" @update:open="$emit('update:open', $event)">
    <SheetContent side="bottom" class="rounded-t-xl pb-safe">
      <SheetHeader class="text-left">
        <SheetTitle class="flex items-center gap-2">
          <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-info" />
          {{ event?.title ?? '' }}
        </SheetTitle>
        <SheetDescription>
          {{ event ? formatPlannerProjectionTimeRange(event, t('schedule.calendar.allDay')) : '' }}
        </SheetDescription>
      </SheetHeader>

      <div class="mt-4 space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">{{ t('task.field.status') }}:</span>
          <span
            class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
            :class="statusBadgeClass"
          >
            {{ statusLabel }}
          </span>
        </div>

        <div v-if="event && status !== 'Completed'" class="pt-2">
          <Button class="w-full gap-2" :disabled="completing" @click="handleComplete">
            <CheckCircle2 class="h-4 w-4" />
            {{ t('task.action.complete') }}
          </Button>
        </div>

        <div
          v-else-if="event && status === 'Completed'"
          class="flex items-center justify-center gap-2 rounded-lg border border-success/40 bg-success/10 py-3 text-sm font-medium text-success"
        >
          <CheckCircle2 class="h-4 w-4" />
          {{ t('task.status.completed') }}
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CalendarEventProjection } from '@memoflow/contracts/schedule';
import { CheckCircle2 } from '@lucide/vue';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Button,
} from '@memoflow/ui-vue-shadcn';
import { formatPlannerProjectionTimeRange } from '../planner/planner-presentation';

type TaskPlannerProjection = Extract<CalendarEventProjection, { sourceType: 'task' }>;

interface Props {
  open: boolean;
  event: TaskPlannerProjection | null;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
  (e: 'complete-task', originalId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { t } = useI18n();
const completing = ref(false);

const status = computed(() => props.event?.displayMetadata.status ?? '');

const statusBadgeClass = computed(() => {
  switch (status.value) {
    case 'Completed':
      return 'bg-success/15 text-success';
    case 'InProgress':
      return 'bg-info/15 text-info';
    case 'Skipped':
      return 'bg-muted text-muted-foreground';
    case 'Missed':
      return 'bg-destructive/15 text-destructive';
    default:
      return 'bg-warning/15 text-warning';
  }
});

const statusLabel = computed(() => {
  if (!status.value) return '';
  return t(`task.instanceStatus.${status.value.toLowerCase()}`, status.value);
});

async function handleComplete() {
  if (!props.event) return;
  completing.value = true;
  emit('complete-task', props.event.ownerCommandTarget.ownerId);
  emit('update:open', false);
  completing.value = false;
}
</script>
