<template>
  <DefineBody>
    <div v-if="events.length === 0" class="py-8 text-center text-sm text-muted-foreground">
      {{ t('schedule.dayDetail.noEvents') }}
    </div>

    <div
      v-else
      class="divide-y divide-[hsl(var(--border-subtle))] border-y border-[hsl(var(--border-subtle))]"
      data-testid="planner-day-event-list"
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
            :class="plannerProjectionSourcePresentation[event.sourceType].dotClass"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ event.title }}</span>
            <span class="block text-xs text-muted-foreground">
              {{ formatPlannerProjectionTimeRange(event, t('schedule.calendar.allDay')) }}
            </span>
            <span
              class="mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
              :class="plannerProjectionSourcePresentation[event.sourceType].badgeClass"
            >
              {{ t(plannerProjectionSourcePresentation[event.sourceType].labelI18nKey) }}
            </span>
          </span>
          <AlertCircle v-if="hasConflict(event)" class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        </button>
      </div>
    </div>
  </DefineBody>
  <DefineFooter>
    <Button variant="ghost" @click="emit('update:open', false)">
      {{ t('common.close') }}
    </Button>
    <Button variant="outline" @click="emit('view-in-day', date)">
      <Calendar class="mr-2 h-4 w-4" />
      {{ t('schedule.dayDetail.viewInDayView') }}
    </Button>
  </DefineFooter>
  <Sheet v-if="isNarrow" :open="open" @update:open="emit('update:open', $event)">
    <SheetContent
      :close-label="t('common.close')"
      side="right"
      class="flex h-full w-full max-w-sm flex-col gap-0 overflow-hidden p-0"
      data-testid="planner-day-sheet"
    >
      <SheetHeader class="shrink-0 border-b border-[hsl(var(--border-subtle))] px-5 py-4 text-left">
        <SheetTitle>{{ dateTitle }}</SheetTitle>
        <SheetDescription>{{
          t('schedule.dayDetail.subtitle', { count: events.length })
        }}</SheetDescription>
      </SheetHeader>
      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <ReuseBody />
      </div>
      <SheetFooter
        class="shrink-0 flex-wrap gap-2 border-t border-[hsl(var(--border-subtle))] px-5 py-3.5"
      >
        <ReuseFooter />
      </SheetFooter>
    </SheetContent>
  </Sheet>
  <Dialog v-else :open="open" @update:open="emit('update:open', $event)">
    <ProductDialogShell :open="open" test-id="planner-day-dialog" size="md">
      <template #icon>
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <CalendarDays class="h-4.5 w-4.5" />
        </span>
      </template>
      <template #title>{{ dateTitle }}</template>
      <template #description>{{
        t('schedule.dayDetail.subtitle', { count: events.length })
      }}</template>
      <ReuseBody />
      <template #footer><ReuseFooter /></template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { createReusableTemplate } from '@vueuse/core';
import { usePanelWidth } from '../../../layouts/shell/usePanelWidth';
import { useI18n } from 'vue-i18n';
import { AlertCircle, Calendar, CalendarDays } from '@lucide/vue';
import type {
  CalendarEventProjection,
  PlannerConflictProjection,
} from '@memoflow/contracts/schedule';
import { plannerConflictSourceKeys } from '@memoflow/schedule/client';
import {
  Button,
  Dialog,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@memoflow/ui-vue-shadcn';
import { ProductDialogShell } from '../../../shared/components';
import { getProductTime, productTimeRevision } from '../../../shared/utils/product-time';
import {
  formatPlannerProjectionTimeRange,
  plannerProjectionKeyForUi,
  plannerProjectionSourcePresentation,
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
}>();

const { t } = useI18n();
const { isNarrow } = usePanelWidth();
const [DefineBody, ReuseBody] = createReusableTemplate();
const [DefineFooter, ReuseFooter] = createReusableTemplate();
const conflictKeys = computed(() => plannerConflictSourceKeys(props.conflicts));

const dateTitle = computed(() => {
  void productTimeRevision.value;
  if (!props.date) return '';
  return getProductTime().format.slot('periodDay', props.date.getTime());
});

function hasConflict(event: CalendarEventProjection): boolean {
  return conflictKeys.value.has(plannerProjectionKeyForUi(event));
}
</script>
