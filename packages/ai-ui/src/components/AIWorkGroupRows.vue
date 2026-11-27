<template>
  <div class="mb-2 min-w-0 space-y-1 text-xs text-muted-foreground" data-testid="ai-agent-activity">
    <!-- Settled turn fold header (Worked for / You stopped after / Failed after / Interrupted) -->
    <div v-if="turn.foldRow" class="border-b border-border/60 pb-2 pt-0.5">
      <Button
        v-if="turn.foldRow.collapsible"
        type="button"
        variant="ghost"
        size="sm"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        :aria-expanded="turn.foldRow.expanded"
        data-testid="ai-agent-phase"
        class="flex h-auto cursor-pointer select-none items-center gap-1 px-1 py-0.5 text-sm font-normal leading-relaxed text-muted-foreground tabular-nums hover:bg-transparent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 [&_svg]:size-3.5"
        @click="$emit('toggle-turn', turn.foldRow.turnKey, turn.foldRow.expanded)"
      >
        <span>{{ foldLabel }}</span>
        <ChevronDown v-if="turn.foldRow.expanded" class="size-3.5 shrink-0" aria-hidden="true" />
        <ChevronRight v-else class="size-3.5 shrink-0" aria-hidden="true" />
      </Button>
      <p
        v-else
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="ai-agent-phase"
        class="px-1 py-0.5 text-sm leading-relaxed text-muted-foreground tabular-nums"
      >
        {{ foldLabel }}
      </p>
    </div>

    <!-- Active / waiting / settled work rows -->
    <template v-for="row in turn.workRows" :key="row.id">
      <!-- Live Working Row -->
      <div v-if="row.kind === 'working'" class="border-b border-border/60 pb-2 pt-0.5">
        <div
          class="flex min-h-6 min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1 text-sm leading-relaxed text-muted-foreground tabular-nums"
        >
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-testid="ai-agent-phase"
            class="shrink-0"
            :class="{ 'animate-pulse': row.phase !== 'waiting' && row.startedAt !== null }"
          >
            {{ workingLabel(row) }}
          </span>
          <span v-if="silenceKey" class="min-w-0 break-words text-xs text-muted-foreground/80">
            · {{ t(`aiAssistant.activity.${silenceKey}`) }}
          </span>
        </div>
      </div>

      <!-- Live Active Tool Row -->
      <Button
        v-else-if="row.kind === 'work-live'"
        type="button"
        variant="ghost"
        size="sm"
        :aria-expanded="row.expanded"
        data-testid="ai-tool-activity"
        class="flex h-auto min-h-6 w-full min-w-0 cursor-pointer justify-start gap-1.5 px-1 py-0.5 text-left text-sm font-normal leading-relaxed hover:bg-muted/35 hover:text-current focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 [&_svg]:size-3.5"
        @click="$emit('toggle-work-group', row.groupId, row.expanded)"
      >
        <span class="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
          <Loader2
            v-if="row.entry.state === 'running' && row.active"
            class="size-3.5 animate-spin text-primary"
          />
          <X v-else-if="row.entry.state === 'failed'" class="size-3.5 text-destructive" />
          <Check v-else class="size-3.5 text-muted-foreground" />
        </span>
        <span
          class="min-w-0 flex-1 truncate"
          :class="row.entry.state === 'failed' ? 'text-destructive' : 'text-foreground/85'"
        >
          {{ toolLabel(row.entry) }} · {{ stateLabel(row.entry.state) }}
        </span>
        <ChevronRight
          v-if="row.groupedEntries.length > 0"
          aria-hidden="true"
          class="size-3 shrink-0 text-muted-foreground/75 transition-transform duration-200"
          :class="{ 'rotate-90': row.expanded }"
        />
      </Button>

      <!-- Settled Tool Group Toggle -->
      <Button
        v-else-if="row.kind === 'work-toggle'"
        type="button"
        variant="ghost"
        size="sm"
        :aria-expanded="row.expanded"
        data-testid="ai-work-group-toggle"
        class="flex h-auto min-h-6 w-full min-w-0 cursor-pointer justify-start gap-1.5 px-1 py-0.5 text-left text-sm font-normal leading-relaxed text-muted-foreground hover:bg-muted/35 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 [&_svg]:size-3.5"
        @click="$emit('toggle-work-group', row.groupId, row.expanded)"
      >
        <span class="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
          <CircleAlert v-if="row.hasFailure" class="size-3.5 text-destructive" />
          <Search v-else-if="row.summaryKind === 'search'" class="size-3.5" />
          <Eye v-else-if="row.summaryKind === 'read'" class="size-3.5" />
          <SquarePen v-else-if="row.summaryKind === 'edit'" class="size-3.5" />
          <Wrench v-else class="size-3.5" />
        </span>
        <span class="min-w-0 flex-1 truncate">{{ workToggleSummary(row) }}</span>
        <ChevronRight
          aria-hidden="true"
          class="size-3 shrink-0 text-muted-foreground/75 transition-transform duration-200"
          :class="{ 'rotate-90': row.expanded }"
        />
      </Button>

      <!-- Tool Group Entries List -->
      <div
        v-else-if="row.kind === 'work'"
        data-testid="ai-agent-history"
        class="rounded-md"
        :class="row.isExpandedToolGroup ? 'max-h-56 overflow-y-auto pl-2 pt-0.5' : 'pl-1'"
      >
        <ol class="space-y-0.5" :aria-label="t('aiAssistant.activity.history')">
          <li
            v-for="call in row.groupedEntries"
            :key="call.id"
            data-testid="ai-tool-history"
            class="flex min-h-5 min-w-0 items-start gap-1.5 py-0.5 text-xs leading-relaxed"
            :class="call.state === 'failed' ? 'text-destructive' : 'text-muted-foreground'"
          >
            <span
              class="mt-0.5 flex size-3.5 shrink-0 items-center justify-center"
              aria-hidden="true"
            >
              <Loader2 v-if="call.state === 'running'" class="size-3 animate-spin text-primary" />
              <X v-else-if="call.state === 'failed'" class="size-3 text-destructive" />
              <Ban
                v-else-if="call.state === 'denied' || call.state === 'interrupted'"
                class="size-3 text-amber-600 dark:text-amber-400"
              />
              <Check v-else class="size-3 text-muted-foreground/80" />
            </span>
            <span class="min-w-0 flex-1 break-words">
              {{ toolLabel(call) }} · {{ stateLabel(call.state) }}
            </span>
          </li>
        </ol>
      </div>
    </template>

    <!-- Waiting instructions -->
    <p v-if="turn.isWaiting" class="px-1 pt-0.5 text-xs text-muted-foreground">
      {{ t('aiAssistant.activity.respond') }}
    </p>

    <!-- Failure / interruption recovery guidance -->
    <p
      v-if="
        !turn.isWaiting &&
        (turn.status === 'failed' || turn.status === 'interrupted' || turn.hasFailedTool)
      "
      class="px-1 pt-0.5 text-xs text-muted-foreground"
      data-testid="ai-agent-recovery"
    >
      {{ t('aiAssistant.activity.recovery') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import {
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Eye,
  Loader2,
  Search,
  SquarePen,
  Wrench,
  X,
} from '@lucide/vue';
import {
  computeRunElapsedMs,
  formatDuration,
  formatWorkingTimer,
  subscribeVisibleSecondTick,
  type AgentActivityRecord,
  type AssistantTurnTimelineRow,
  type ChatWorkRow,
} from '../composables/agentActivity';

const props = defineProps<{
  turn: AssistantTurnTimelineRow;
}>();

defineEmits<{
  'toggle-turn': [turnKey: string, currentlyExpanded: boolean];
  'toggle-work-group': [groupId: string, currentlyExpanded: boolean];
}>();

const { t, te, locale } = useI18n();
const nowMs = ref(Date.now());
let unsubscribeTick: (() => void) | undefined;

const needsLiveTick = computed(() => {
  const workingRow = props.turn.workRows.find(
    (row): row is Extract<ChatWorkRow, { kind: 'working' }> => row.kind === 'working',
  );
  if (!workingRow || workingRow.isWaiting) return false;
  return workingRow.startedAt !== null || props.turn.activityUpdatedAt !== undefined;
});

watch(
  needsLiveTick,
  (active) => {
    unsubscribeTick?.();
    unsubscribeTick = undefined;
    if (active) {
      nowMs.value = Date.now();
      unsubscribeTick = subscribeVisibleSecondTick((tickNow) => {
        nowMs.value = tickNow;
      });
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  unsubscribeTick?.();
  unsubscribeTick = undefined;
});

function translateOrFallback(
  key: string,
  params: Record<string, unknown>,
  en: string,
  zh: string,
): string {
  if (te(key)) return t(key, params);
  return locale.value.toLowerCase().startsWith('zh') ? zh : en;
}

const silenceKey = computed(() => {
  if (!props.turn.isActive || props.turn.activityUpdatedAt === undefined) return '';
  const elapsed = nowMs.value - props.turn.activityUpdatedAt;
  return elapsed >= 120_000 ? 'silentLong' : elapsed >= 30_000 ? 'silent' : '';
});

function workingLabel(row: Extract<ChatWorkRow, { kind: 'working' }>): string {
  if (row.phase === 'waiting') {
    return t('aiAssistant.activity.waiting');
  }
  const elapsedMs = computeRunElapsedMs(
    {
      runId: props.turn.runId ?? row.turnKey,
      startedAt: row.startedAt,
      completedAt: null,
      pausedDurationMs: row.pausedDurationMs,
      pausedAt: row.pausedAt,
      clockOffsetMs: row.clockOffsetMs,
    },
    nowMs.value,
  );
  if (elapsedMs !== null) {
    const duration = formatWorkingTimer(elapsedMs, locale.value);
    return translateOrFallback(
      'aiAssistant.activity.workingFor',
      { duration },
      `Working for ${duration}`,
      `已工作 ${duration}`,
    );
  }
  return t(`aiAssistant.activity.${row.phase}`);
}

const foldLabel = computed(() => {
  const fold = props.turn.foldRow;
  if (!fold) return '';
  const duration = fold.elapsedMs !== null ? formatDuration(fold.elapsedMs, locale.value) : null;
  if (fold.status === 'cancelled') {
    return duration
      ? translateOrFallback(
          'aiAssistant.activity.stoppedAfter',
          { duration },
          `You stopped after ${duration}`,
          `你在 ${duration} 后停止`,
        )
      : translateOrFallback(
          'aiAssistant.activity.stopped',
          {},
          'You stopped this response',
          '你停止了本次回复',
        );
  }
  if (fold.status === 'failed') {
    return duration
      ? translateOrFallback(
          'aiAssistant.activity.failedAfter',
          { duration },
          `Failed after ${duration}`,
          `在 ${duration} 后失败`,
        )
      : t('aiAssistant.activity.error');
  }
  if (fold.status === 'interrupted') {
    return t('aiAssistant.activity.interrupted');
  }
  return duration
    ? translateOrFallback(
        'aiAssistant.activity.workedFor',
        { duration },
        `Worked for ${duration}`,
        `工作了 ${duration}`,
      )
    : translateOrFallback(
        'aiAssistant.activity.worked',
        {},
        'Worked',
        te('aiAssistant.activity.completed') ? t('aiAssistant.activity.completed') : '已完成',
      );
});

function workToggleSummary(row: Extract<ChatWorkRow, { kind: 'work-toggle' }>): string {
  const count = row.hiddenCount;
  const failedCount = row.groupedEntries.filter((entry) => entry.state === 'failed').length;
  const zh = locale.value.toLowerCase().startsWith('zh');
  const base = zh ? `共 ${count} 次工具调用` : `${count} tool calls`;
  if (failedCount > 0) {
    return zh ? `${base} · ${failedCount} 项失败` : `${base} · ${failedCount} failed`;
  }
  return base;
}

function toolLabel(call: AgentActivityRecord): string {
  const key = `aiAssistant.chatPage.tools.capabilities.${call.name}`;
  return call.builtin && te(key) ? t(key) : call.name || t('aiAssistant.activity.tool');
}

function stateLabel(state: string): string {
  const key = `aiAssistant.activity.${state}`;
  return te(key) ? t(key) : state;
}
</script>
