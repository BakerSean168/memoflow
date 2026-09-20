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
          class="divide-y border-y border-border/70"
          data-testid="schedule-day-event-list"
        >
          <div
            v-for="event in events"
            :key="event.id"
            class="flex items-start transition-colors focus-within:bg-muted/30 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring hover:bg-muted/30"
          >
            <button
              type="button"
              :data-testid="`schedule-event-${event.id}`"
              :aria-label="t('schedule.calendar.openEvent', { title: event.title })"
              class="flex min-w-0 flex-1 items-start gap-3 p-3 text-left focus-visible:outline-none"
              @click="emit('event-click', event)"
            >
              <span
                class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                :class="{
                  'bg-primary': event.source === 'schedule',
                  'bg-success': event.source === 'goal',
                  'bg-info': event.source === 'task',
                }"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ event.title }}</span>
                <span class="block text-xs text-muted-foreground">{{
                  formatTimeRange(event)
                }}</span>
                <span
                  class="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
                  :class="{
                    'bg-primary/10 text-primary': event.source === 'schedule',
                    'bg-success/15 text-success': event.source === 'goal',
                    'bg-info/15 text-info': event.source === 'task',
                  }"
                >
                  {{ calendarEventSourceLabel(event.source, t) }}
                </span>
              </span>
              <AlertCircle v-if="event.hasConflict" class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            </button>
            <!-- Complete button: only for task instances that are not yet completed -->
            <button
              v-if="event.source === 'task' && event.instanceStatus !== 'Completed'"
              type="button"
              :aria-label="t('task.action.complete')"
              class="m-2 ml-0 shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-success/10 hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :title="t('task.action.complete')"
              @click="emit('complete-task', event.originalId)"
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Button,
} from '@memoflow/ui-vue-shadcn';
import { calendarEventSourceLabel, type CalendarEventItem } from '../composables/useCalendarView';
import { formatCalendarEventTimeRange } from '../../../shared/utils/format-calendar-event-time-range';
import { getProductTime } from '../../../shared/utils/product-time';

interface Props {
  open: boolean;
  date: Date | null;
  events: CalendarEventItem[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'event-click', event: CalendarEventItem): void;
  (e: 'view-in-day', date: Date | null): void;
  (e: 'complete-task', originalId: string): void;
}>();

const { t } = useI18n();

const dateTitle = computed(() => {
  if (!props.date) return '';
  return getProductTime().format.slot('periodDay', props.date.getTime());
});

/**
 * Residual 1213 keep-boundary: app-vue schedule event/all-day time range (vs app-react Intl pair).
 * Residual 1273: local dual retired onto formatCalendarEventTimeRange sole.
 * Residual 1291: sourceLabel dual retired onto calendarEventSourceLabel sole.
 * Soft residual 1213: app-react useScheduleAgenda formatTimeRange is Intl zh-CN pair (no force-merge).
 */
function formatTimeRange(event: CalendarEventItem): string {
  return formatCalendarEventTimeRange(event, t('schedule.calendar.allDay'));
}
</script>
