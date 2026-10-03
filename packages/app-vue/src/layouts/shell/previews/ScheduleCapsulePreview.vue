<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowRight, CalendarDays } from '@lucide/vue';
import {
  calendarEventSourceLabel,
  formatCapsuleTime,
  toLocalDateKey,
  type CalendarEventItem,
  type ScheduleCapsuleSnapshot,
  useCalendarView,
} from '../../../modules/schedule/composables/useCalendarView';
import {
  CapsulePreviewFooter,
  CapsulePreviewHeader,
  CapsulePreviewShell,
  CapsulePreviewState,
} from '../../../shared/components';

const emit = defineEmits<{
  'view-all': [];
  select: [event: CalendarEventItem];
}>();

const { t } = useI18n();
const calendar = useCalendarView();
const isLoading = ref(false);
const snapshot = ref<ScheduleCapsuleSnapshot>({
  kind: 'empty',
  event: null,
  minutesUntilStart: null,
});

const UPCOMING_DISPLAY_LIMIT = 4;

const primaryEvent = computed(() => snapshot.value.event);
const primaryTitle = computed(() =>
  snapshot.value.kind === 'current'
    ? t('shell.schedule.currentTitle')
    : t('shell.schedule.nextTitle'),
);

const primaryTime = computed(() => {
  const event = primaryEvent.value;
  if (!event) return '';
  if (event.displayMode === 'all-day') return t('shell.preview.allDay');
  return `${formatCapsuleTime(event.startTime)}–${formatCapsuleTime(event.endTime)}`;
});

const upcomingEvents = computed(() => {
  const now = Date.now();
  const todayKey = toLocalDateKey(now);
  const focusStart = primaryEvent.value?.startTime ?? now;

  return calendar.capsuleEvents.value
    .filter(
      (event) =>
        toLocalDateKey(event.startTime) === todayKey &&
        event.startTime > focusStart &&
        event.id !== primaryEvent.value?.id &&
        event.displayMode !== 'all-day',
    )
    .sort((a, b) => a.startTime - b.startTime);
});

const upcomingList = computed(() => upcomingEvents.value.slice(0, UPCOMING_DISPLAY_LIMIT));
const upcomingRemaining = computed(() =>
  Math.max(0, upcomingEvents.value.length - UPCOMING_DISPLAY_LIMIT),
);

async function load(): Promise<void> {
  isLoading.value = true;
  try {
    await calendar.ensureTodayLoaded();
    snapshot.value = calendar.getScheduleCapsuleSnapshot();
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <CapsulePreviewShell
    max-height="30rem"
    data-testid="schedule-capsule-preview"
    data-capsule-workspace="schedule"
  >
    <CapsulePreviewHeader :title="t('nav.schedule')" :subtitle="t('shell.schedule.today')">
      <template #actions>
        <CalendarDays class="h-4 w-4 text-muted-foreground/70" />
      </template>
    </CapsulePreviewHeader>

    <CapsulePreviewState v-if="isLoading" kind="loading" data-testid="schedule-capsule-loading">
      <div class="h-14 animate-pulse rounded-lg bg-muted/70" />
      <div class="h-10 animate-pulse rounded-lg bg-muted/50" />
      <div class="h-10 animate-pulse rounded-lg bg-muted/50" />
    </CapsulePreviewState>

    <CapsulePreviewState
      v-else-if="!primaryEvent"
      kind="empty"
      data-testid="schedule-capsule-empty"
    >
      <CalendarDays class="h-6 w-6 text-muted-foreground/45" />
      <p class="text-[11px] text-muted-foreground">{{ t('shell.schedule.empty') }}</p>
    </CapsulePreviewState>

    <template v-else>
      <div class="py-2" data-testid="schedule-capsule-summary">
        <p class="px-1 text-[10px] font-medium text-muted-foreground">{{ primaryTitle }}</p>
        <button
          type="button"
          class="mt-1 w-full rounded-lg bg-accent/45 px-2.5 py-2 text-left transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
          data-testid="schedule-capsule-primary"
          @click="primaryEvent && emit('select', primaryEvent)"
        >
          <span class="flex min-w-0 items-center justify-between gap-3">
            <span class="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
              {{ primaryEvent.title }}
            </span>
            <span class="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              {{ primaryTime }}
            </span>
          </span>
          <span
            class="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground"
          >
            <span>{{ calendarEventSourceLabel(primaryEvent.source, t) }}</span>
            <span v-if="snapshot.kind === 'upcoming' && snapshot.minutesUntilStart != null">
              {{ t('shell.schedule.startsIn', { minutes: snapshot.minutesUntilStart }) }}
            </span>
          </span>
        </button>
      </div>

      <div
        v-if="upcomingList.length"
        class="min-h-0 flex-1 border-t border-border/40 pt-2"
        data-testid="schedule-capsule-upcoming"
      >
        <p class="px-1 text-[10px] font-medium text-muted-foreground">
          {{ t('shell.schedule.upcomingTitle') }}
        </p>
        <div class="mt-1 space-y-0.5">
          <button
            v-for="event in upcomingList"
            :key="event.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
            :data-testid="`schedule-capsule-event-${event.id}`"
            @click="emit('select', event)"
          >
            <span class="w-10 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              {{ formatCapsuleTime(event.startTime) }}
            </span>
            <span class="min-w-0 flex-1 truncate text-[11px] text-foreground">
              {{ event.title }}
            </span>
            <span class="shrink-0 text-[9px] text-muted-foreground/70">
              {{ calendarEventSourceLabel(event.source, t) }}
            </span>
          </button>
        </div>

        <p
          v-if="upcomingRemaining > 0"
          class="mt-1 px-2 text-[10px] text-muted-foreground"
          data-testid="schedule-capsule-more"
        >
          {{ t('shell.schedule.moreCount', { count: upcomingRemaining }) }}
        </p>
      </div>
    </template>

    <CapsulePreviewFooter>
      <button
        type="button"
        class="flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        data-testid="schedule-capsule-view-all"
        @click="$emit('view-all')"
      >
        {{ t('shell.openSchedule') }}
        <ArrowRight class="h-3.5 w-3.5" />
      </button>
    </CapsulePreviewFooter>
  </CapsulePreviewShell>
</template>
