<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="w-96 overflow-y-auto" data-testid="event-detail-sheet">
      <SheetHeader>
        <SheetTitle class="flex items-center gap-2">
          <span
            class="h-2.5 w-2.5 shrink-0 rounded-full"
            :class="{
              'bg-primary': event?.source === 'schedule',
              'bg-success': event?.source === 'goal',
              'bg-info': event?.source === 'task',
            }"
          />
          {{ event?.title }}
        </SheetTitle>
        <SheetDescription>{{ t('schedule.eventDetail.subtitle') }}</SheetDescription>
      </SheetHeader>

      <div v-if="event" class="mt-4 space-y-4">
        <div class="space-y-1">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {{ t('schedule.eventDetail.time') }}
          </p>
          <p class="text-sm text-foreground">
            {{ event.displayMode === 'all-day' ? t('schedule.eventDetail.allDay') : timeRange }}
          </p>
        </div>

        <div class="space-y-1">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {{ t('schedule.eventDetail.source') }}
          </p>
          <span
            class="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium"
            :class="{
              'bg-primary/10 text-primary': event.source === 'schedule',
              'bg-success/15 text-success': event.source === 'goal',
              'bg-info/15 text-info': event.source === 'task',
            }"
          >
            {{ calendarEventSourceLabel(event.source, t) }}
          </span>
        </div>

        <Alert v-if="event.hasConflict" class="border-warning/40 bg-warning/10">
          <AlertTriangle class="h-4 w-4 text-warning" />
          <AlertDescription class="text-xs">
            {{ t('schedule.eventDetail.conflictHint') }}
          </AlertDescription>
        </Alert>

        <p class="text-xs leading-5 text-muted-foreground">
          {{ t('schedule.eventDetail.readOnlyHint') }}
        </p>
      </div>
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
/**
 * EventDetailSheet — 非任务日历事件的只读详情（UI_PAGE_REDESIGN_PLAN §7）
 *
 * 补位：此前非任务事件点击仅 toast（Brief §8-P3 交互断层）。
 * 只读展示既有投影字段（标题/时间/来源/冲突）；编辑能力另立项，
 * 不在本轮引入新数据依赖。参照 DayDetailSheet 实现。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Alert,
  AlertDescription,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@memoflow/ui-vue-shadcn';
import { AlertTriangle } from '@lucide/vue';
import { calendarEventSourceLabel, type CalendarEventItem } from '../composables/useCalendarView';
import { getProductTime, productTimeRevision } from '../../../shared/utils/product-time';
// Residual 1291: sourceLabel dual retired onto calendarEventSourceLabel sole.

const props = defineProps<{
  open: boolean;
  event: CalendarEventItem | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const { t } = useI18n();

const timeRange = computed(() => {
  void productTimeRevision.value;
  if (!props.event) return '';
  const time = getProductTime();
  return `${time.format.pattern(props.event.startTime, 'MMM d HH:mm')} – ${time.format.pattern(props.event.endTime, 'MMM d HH:mm')}`;
});
</script>
