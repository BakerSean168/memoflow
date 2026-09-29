<template>
  <div
    class="flex max-h-[28rem] min-h-0 flex-col"
    data-testid="routine-capsule-preview"
    data-capsule-workspace="routine"
  >
    <div class="flex items-center justify-between gap-3 border-b border-[hsl(var(--border-subtle))] pb-2">
      <div>
        <p class="text-xs font-semibold text-foreground">{{ t('routine.title') }}</p>
        <p class="mt-0.5 text-[10px] text-muted-foreground">{{ t('routine.home.title') }}</p>
      </div>
      <span
        class="rounded-full bg-[hsl(var(--surface-raised)/0.68)] px-2 py-0.5 font-mono text-[10px] text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.4)]"
      >
        {{ occurrences.length }}
      </span>
    </div>

    <div v-if="loading && occurrences.length === 0" class="space-y-1.5 py-3">
      <div
        v-for="index in 3"
        :key="index"
        class="h-10 animate-pulse rounded-lg bg-[hsl(var(--surface-raised)/0.6)]"
      />
    </div>

    <div
      v-else-if="error"
      class="flex flex-col items-center gap-2 py-5 text-center"
      data-testid="routine-capsule-error"
    >
      <p class="max-w-64 text-[11px] leading-4 text-muted-foreground">{{ error }}</p>
      <Button type="button" size="sm" variant="ghost" class="h-7 text-[11px]" @click="load(true)">
        <RotateCcw class="mr-1.5 h-3.5 w-3.5" />
        {{ t('common.retry') }}
      </Button>
    </div>

    <div
      v-else-if="occurrences.length === 0"
      class="py-7 text-center text-[11px] text-muted-foreground"
      data-testid="routine-capsule-empty"
    >
      {{ t('routine.home.empty') }}
    </div>

    <div v-else class="min-h-0 flex-1 overflow-y-auto py-1.5">
      <div
        v-for="occurrence in occurrences"
        :key="occurrence.occurrenceKey"
        class="group flex items-start gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-[hsl(var(--hover)/0.55)]"
        data-testid="routine-capsule-occurrence"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-start gap-2 rounded-md px-0 py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
          :data-testid="`routine-capsule-open-${occurrence.routineId}`"
          @click="emit('select', occurrence.routineId)"
        >
          <span
            class="w-11 shrink-0 pt-0.5 font-mono text-[10px] font-medium tabular-nums text-foreground"
          >
            {{ formatProductHm(occurrence.occurrenceAt) }}
          </span>

          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs font-medium text-foreground">
              {{ occurrence.title }}
            </span>
            <span
              v-if="occurrence.description"
              class="mt-0.5 block line-clamp-1 text-[10px] leading-4 text-muted-foreground"
            >
              {{ occurrence.description }}
            </span>
          </span>
        </button>

        <button
          type="button"
          class="mt-0.5 flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] text-[hsl(var(--foreground-subtle))] opacity-0 transition-opacity hover:bg-[hsl(var(--hover))] hover:text-foreground group-hover:opacity-100 focus:opacity-100"
          :disabled="mutatingRoutineId === occurrence.routineId"
          :title="t('routine.card.snooze30')"
          @click="snoozeRoutine(occurrence.routineId)"
        >
          <Loader2 v-if="mutatingRoutineId === occurrence.routineId" class="h-3 w-3 animate-spin" />
          <Clock3 v-else class="h-3 w-3" />
          {{ t('routine.card.snooze30') }}
        </button>
      </div>
    </div>

    <div class="flex shrink-0 justify-end border-t border-[hsl(var(--border-subtle))] pt-2">
      <button
        type="button"
        class="flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-[hsl(var(--foreground-muted))] transition-colors hover:bg-[hsl(var(--hover))] hover:text-foreground"
        data-testid="routine-capsule-view-all"
        @click="emit('view-all')"
      >
        {{ t('routine.home.viewAll') }}
        <ArrowRight class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowRight, Clock3, Loader2, RotateCcw } from '@lucide/vue';
import { Button } from '@memoflow/ui-vue-shadcn';
import type { RoutineUpcomingOccurrence } from '@memoflow/contracts/routine';
import { ROUTINE_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import {
  endOfDayMs,
  formatProductHm,
  startOfDayMs,
} from '../../../shared/utils/product-time';
import { useServerStateIdentityScope, useServerStateRuntime } from '../../../platform/server-state';
import { routineUpcomingQueryKeys } from '../../../platform/server-state/query-keys';
import { fetchRoutineUpcomingCached } from '../composables/routineUpcomingCache';

const emit = defineEmits<{
  'view-all': [];
  select: [routineId: string];
}>();
const { t } = useI18n();
const service = useStrictInject(ROUTINE_SERVICE_KEY, 'RoutineService');
const runtime = useServerStateRuntime();
const resolveIdentityScope = useServerStateIdentityScope();

const occurrences = ref<RoutineUpcomingOccurrence[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const mutatingRoutineId = ref<string | null>(null);

function todayRange(now = Date.now()) {
  return { start: startOfDayMs(now), end: endOfDayMs(now), limit: 500 };
}

function applyUpcoming(
  source: RoutineUpcomingOccurrence[],
  now = Date.now(),
): void {
  occurrences.value = source.filter((occurrence) => occurrence.occurrenceAt >= now);
}

async function load(force = false): Promise<void> {
  loading.value = occurrences.value.length === 0;
  error.value = null;
  const now = Date.now();
  const range = todayRange(now);
  try {
    const next = await fetchRoutineUpcomingCached({
      queryClient: runtime.queryClient,
      identityScope: resolveIdentityScope(),
      service,
      ...range,
      force,
    });
    applyUpcoming(next, now);
  } catch (cause) {
    occurrences.value = [];
    const message =
      cause && typeof cause === 'object' && 'message' in cause
        ? (cause as { message?: unknown }).message
        : null;
    error.value =
      typeof message === 'string' && message.trim() ? message : t('common.operationFailed');
  } finally {
    loading.value = false;
  }
}

async function snoozeRoutine(routineId: string): Promise<void> {
  if (mutatingRoutineId.value) return;
  const until = Date.now() + 30 * 60_000;
  mutatingRoutineId.value = routineId;
  error.value = null;
  try {
    const result = await service.setTemporaryOverride(routineId, {
      snoozeUntil: until,
      expiresAt: until,
      reason: 'Routine capsule quick workspace: snooze 30 minutes',
      source: 'user',
    });
    if (!result.ok) {
      error.value = result.error.message;
      return;
    }
    await load(true);
  } finally {
    mutatingRoutineId.value = null;
  }
}

const initialRange = todayRange();
const cachedOccurrences = runtime.queryClient.getQueryData<RoutineUpcomingOccurrence[]>(
  routineUpcomingQueryKeys.range(
    resolveIdentityScope(),
    initialRange.start,
    initialRange.end,
    initialRange.limit,
  ),
);
if (cachedOccurrences) applyUpcoming(cachedOccurrences);

onMounted(() => {
  void load();
});
</script>
