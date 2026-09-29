<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="w-96 overflow-y-auto">
      <SheetHeader>
        <SheetTitle>{{ dateTitle }}</SheetTitle>
        <SheetDescription>
          {{ t('schedule.dayDetail.subtitle', { count: events.length }) }}
        </SheetDescription>
      </SheetHeader>

      <div class="mt-4">
        <div v-if="events.length === 0" class="py-8 text-center text-sm text-muted-foreground">
          {{ t('schedule.dayDetail.noEvents') }}
        </div>

        <div
          v-if="events.length > 0"
          class="divide-y divide-[hsl(var(--border-subtle))] border-y border-[hsl(var(--border-subtle))]"
          data-testid="schedule-day-event-list"
        >
          <div
            v-for="event in events"
            :key="plannerProjectionKeyForUi(event)"
            class="flex items-start transition-colors focus-within:bg-[hsl(var(--selected)/0.5)] focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring hover:bg-[hsl(var(--hover)/0.52)]"
          >
            <button
              type="button"
              :data-testid="`schedule-event-${event.sourceType}-${event.sourceId}`"
              :aria-label="t('schedule.calendar.openEvent', { title: event.title })"
              class="flex min-w-0 flex-1 items-start gap-3 p-3 text-left focus-visible:outline-none"
              @click="emit('event-click', event)"
            >
              <span
                class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                :class="sourceDotClass(event)"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ event.title }}</span>
                <span class="block text-xs text-muted-foreground">
                  {{ formatPlannerProjectionTimeRange(event, t('schedule.calendar.allDay')) }}
                </span>
                <span
                  class="mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
                  :class="sourceBadgeClass(event)"
                >
                  {{ t(`schedule.source.${event.sourceType}`) }}
                </span>
              </span>
              <AlertCircle
                v-if="hasConflict(event)"
                class="mt-0.5 h-4 w-4 shrink-0 text-warning"
              />
            </button>

            <button
              v-if="
                event.sourceType === 'task' &&
                event.displayMetadata.status !== 'Completed'
              "
              type="button"
              :aria-label="t('task.action.complete')"
              class="m-2 ml-0 shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-success/10 hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :title="t('task.action.complete')"
              @click="emit('complete-task', event.ownerCommandTarget.ownerId)"
            >
              <CheckCircle2 class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <SheetFooter class="mt-6">
        <Button variant="outline" class="w-full" @click="emit('view-in-day', date)">
          <Calendar class="mr-2 h-4 w-4" />
          {{ t('schedule.dayDetail.viewInDayView') }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertCircle, Calendar, CheckCircle2 } from '@lucide/vue';
import type {
  CalendarEventProjection,
  PlannerConflictProjection,
} from '@memoflow/contracts/schedule';
import { plannerConflictSourceKeys } from '@memoflow/schedule/client';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Button,
} from '@memoflow/ui-vue-shadcn';
import { getProductTime } from '../../../shared/utils/product-time';
import {
  formatPlannerProjectionTimeRange,
  plannerProjectionKeyForUi,
} from '../planner/planner-presentation';

interface Props {
  open: boolean;
  date: Date | null;
  events: CalendarEventProjection[];
  conflicts?: PlannerConflictProjection[];
}

const props = withDefaults(defineProps<Props>(), {
  conflicts: () => [],
});

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'event-click', event: CalendarEventProjection): void;
  (e: 'view-in-day', date: Date | null): void;
  (e: 'complete-task', originalId: string): void;
}>();

const { t } = useI18n();

const conflictKeys = computed(() => plannerConflictSourceKeys(props.conflicts));

const dateTitle = computed(() => {
  if (!props.date) return '';
  return getProductTime().format.slot('periodDay', props.date.getTime());
});

function hasConflict(event: CalendarEventProjection): boolean {
  return conflictKeys.value.has(plannerProjectionKeyForUi(event));
}

function sourceDotClass(event: CalendarEventProjection): string {
  switch (event.sourceType) {
    case 'schedule':
      return 'bg-primary';
    case 'task':
      return 'bg-info';
    case 'goal':
      return 'bg-success';
    case 'routine':
      return 'bg-muted-foreground';
  }
}

function sourceBadgeClass(event: CalendarEventProjection): string {
  switch (event.sourceType) {
    case 'schedule':
      return 'bg-primary/10 text-primary';
    case 'task':
      return 'bg-info/15 text-info';
    case 'goal':
      return 'bg-success/15 text-success';
    case 'routine':
      return 'bg-muted text-muted-foreground';
  }
}
</script>
