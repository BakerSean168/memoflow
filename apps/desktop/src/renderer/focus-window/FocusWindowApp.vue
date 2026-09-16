<template>
  <main class="focus-window" :class="{ 'is-collapsed': collapsed }" data-testid="focus-window">
    <header class="focus-window__drag-region">
      <div class="focus-window__identity">
        <strong>{{ projection?.protocolName ?? 'Focus session' }}</strong>
        <span v-if="projection">{{ phaseLabel }}</span>
      </div>
      <div class="focus-window__window-actions no-drag">
        <button
          type="button"
          :aria-label="collapsed ? 'Expand focus window' : 'Collapse focus window'"
          @click="toggleCollapsed"
        >
          {{ collapsed ? '▢' : '—' }}
        </button>
        <button
          type="button"
          :aria-pressed="alwaysOnTop"
          aria-label="Toggle always on top"
          @click="toggleAlwaysOnTop"
        >
          ⌃
        </button>
        <button
          type="button"
          aria-label="Hide focus window"
          @click="sendCommand({ action: 'hide' })"
        >
          ×
        </button>
      </div>
    </header>

    <section v-if="projection && !collapsed" class="focus-window__body" aria-live="polite">
      <div class="focus-window__countdown" data-testid="focus-countdown">{{ countdownLabel }}</div>
      <div class="focus-window__meta">
        <span>{{ projection.state }}</span>
        <span v-if="projection.cycle != null"
          >Cycle {{ projection.cycle }}/{{ projection.totalCycles }}</span
        >
        <span v-if="projection.phaseIndex != null"
          >Phase {{ projection.phaseIndex + 1 }}/{{ projection.phaseCount }}</span
        >
      </div>
      <div class="focus-window__progress" aria-hidden="true">
        <div class="focus-window__progress-value" :style="{ width: `${progressPercent}%` }" />
      </div>
      <div class="focus-window__session-actions no-drag">
        <button
          v-if="projection.state === 'Running'"
          type="button"
          @click="sendCommand({ action: 'pause' })"
        >
          Pause
        </button>
        <button
          v-else-if="projection.state === 'Paused'"
          type="button"
          @click="sendCommand({ action: 'resume' })"
        >
          Resume
        </button>
        <button
          v-if="projection.state === 'Running' || projection.state === 'Paused'"
          type="button"
          class="danger"
          @click="sendCommand({ action: 'end' })"
        >
          End
        </button>
      </div>
    </section>

    <section v-else-if="!projection && !collapsed" class="focus-window__empty">
      No active focus session
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  RoutineWindowChannels,
  type FocusWindowCommand,
  type FocusWindowProjection,
} from '@memoflow/contracts/electron';
import type { Result } from '@memoflow/contracts/result';

const projection = ref<FocusWindowProjection | null>(null);
const collapsed = ref(false);
const alwaysOnTop = ref(false);
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

const remainingMs = computed(() => {
  const current = projection.value;
  if (!current) return 0;
  if (current.state === 'Paused')
    return Math.max(0, current.pausedRemainingMs ?? current.remainingMs ?? 0);
  if (current.phaseDeadline != null) return Math.max(0, current.phaseDeadline - now.value);
  return Math.max(0, current.remainingMs ?? 0);
});

const countdownLabel = computed(() => {
  const totalSeconds = Math.ceil(remainingMs.value / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
});

const phaseLabel = computed(() => {
  const current = projection.value;
  if (!current?.phaseKind) return current?.state ?? '';
  const labels: Record<string, string> = {
    Prepare: 'Prepare',
    Focus: 'Focus',
    ShortBreak: 'Short break',
    LongBreak: 'Long break',
    Recovery: 'Recovery',
  };
  return labels[current.phaseKind] ?? current.phaseKind;
});

const progressPercent = computed(() => {
  const duration = projection.value?.phaseDurationMs ?? 0;
  if (duration <= 0) return 0;
  return Math.min(100, Math.max(0, ((duration - remainingMs.value) / duration) * 100));
});

function unwrapProjection(value: unknown): FocusWindowProjection | null {
  const result = value as Result<FocusWindowProjection | null>;
  if (!result || result.ok !== true) return null;
  return result.data;
}

async function sendCommand(command: FocusWindowCommand): Promise<void> {
  const bridge = window.electronAPI;
  if (!bridge) return;
  const next = unwrapProjection(
    await bridge.invoke(RoutineWindowChannels.FOCUS_WINDOW_COMMAND, command),
  );
  if (next) projection.value = next;
  if (command.action === 'collapse') collapsed.value = command.collapsed;
  if (command.action === 'always-on-top') alwaysOnTop.value = command.enabled;
}

async function toggleCollapsed(): Promise<void> {
  await sendCommand({ action: 'collapse', collapsed: !collapsed.value });
}

async function toggleAlwaysOnTop(): Promise<void> {
  await sendCommand({ action: 'always-on-top', enabled: !alwaysOnTop.value });
}

const onProjection = (value: unknown): void => {
  projection.value = value as FocusWindowProjection;
  now.value = Date.now();
};

onMounted(async () => {
  const bridge = window.electronAPI;
  if (bridge) {
    projection.value = unwrapProjection(
      await bridge.invoke(RoutineWindowChannels.FOCUS_WINDOW_GET),
    );
    bridge.on(RoutineWindowChannels.FOCUS_WINDOW_PROJECTION, onProjection);
  }
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1_000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  timer = null;
  window.electronAPI?.off(RoutineWindowChannels.FOCUS_WINDOW_PROJECTION, onProjection);
});
</script>

<style scoped>
.focus-window {
  min-height: 100vh;
  color: #f4f4f5;
  background: radial-gradient(circle at top right, #18233d 0, #09090b 44%, #09090b 100%);
  user-select: none;
  overflow: hidden;
}

.focus-window.is-collapsed {
  min-height: 104px;
}

.focus-window__drag-region {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 10px 12px;
}

.focus-window__identity {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.focus-window__identity strong,
.focus-window__identity span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.focus-window__identity span,
.focus-window__meta {
  color: #a1a1aa;
  font-size: 12px;
}

.no-drag,
button {
  -webkit-app-region: no-drag;
}

.focus-window__window-actions,
.focus-window__session-actions {
  display: flex;
  gap: 6px;
}

button {
  min-height: 30px;
  padding: 4px 10px;
  color: inherit;
  border: 1px solid #3f3f46;
  border-radius: 8px;
  background: #18181b;
  cursor: pointer;
}

button:hover {
  background: #27272a;
}

button.danger {
  color: #fecaca;
  border-color: #7f1d1d;
}

.focus-window__body {
  display: grid;
  gap: 14px;
  padding: 10px 18px 18px;
}

.focus-window__countdown {
  font-size: 52px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: -2px;
  line-height: 1;
}

.focus-window__meta {
  display: flex;
  gap: 12px;
}

.focus-window__progress {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #27272a;
}

.focus-window__progress-value {
  height: 100%;
  border-radius: inherit;
  background: #60a5fa;
  transition: width 0.25s linear;
}

.focus-window__empty {
  padding: 18px;
  color: #a1a1aa;
}
</style>
