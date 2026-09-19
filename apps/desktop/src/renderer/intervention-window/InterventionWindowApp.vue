<template>
  <main
    class="intervention-window"
    :class="projection ? `is-${projection.state.toLowerCase()}` : ''"
    data-testid="intervention-window"
  >
    <header class="intervention-window__drag-region">
      <div class="intervention-window__identity">
        <span>MemoFlow Routine</span>
        <strong>{{ phaseTitle }}</strong>
      </div>
    </header>

    <section v-if="projection" class="intervention-window__body" aria-live="polite">
      <p class="intervention-window__message" data-testid="intervention-message">
        {{ phaseMessage }}
      </p>
      <p
        v-if="projection.phaseDeadline != null"
        class="intervention-window__countdown"
        data-testid="intervention-countdown"
      >
        {{ countdownLabel }}
      </p>
      <p v-if="projection.state === 'Guided'" class="intervention-window__guided">
        Take the break now. Return when the routine feels complete.
      </p>
      <div class="intervention-window__actions no-drag">
        <button type="button" class="primary" @click="sendCommand({ action: 'complete' })">
          {{ projection.state === 'Guided' ? 'Complete break' : 'Done' }}
        </button>
        <button type="button" @click="sendCommand({ action: 'snooze', durationMs: 300_000 })">
          Snooze 5 min
        </button>
        <button
          type="button"
          aria-label="Dismiss intervention"
          @click="sendCommand({ action: 'dismiss' })"
        >
          Dismiss
        </button>
      </div>
    </section>

    <section v-else class="intervention-window__empty">No active intervention</section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  RoutineWindowChannels,
  type InterventionWindowCommand,
  type InterventionWindowProjection,
} from '@memoflow/contracts/electron';
import type { Result } from '@memoflow/contracts/result';
import { getElectronBridge } from '../platform/electron-bridge';

const projection = ref<InterventionWindowProjection | null>(null);
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

const remainingMs = computed(() => {
  const deadline = projection.value?.phaseDeadline;
  if (deadline == null) return Math.max(0, projection.value?.remainingMs ?? 0);
  return Math.max(0, deadline - now.value);
});

const countdownLabel = computed(() => {
  const totalSeconds = Math.ceil(remainingMs.value / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
});

const phaseTitle = computed(() => {
  switch (projection.value?.state) {
    case 'Gentle':
      return 'A pause is coming';
    case 'Grace':
      return 'Find a natural pause';
    case 'Guided':
      return 'Guided break';
    default:
      return 'Routine intervention';
  }
});

const phaseMessage = computed(() => {
  switch (projection.value?.state) {
    case 'Gentle':
      return 'Finish the thought you are on, then take a short break.';
    case 'Grace':
      return 'Use the next natural stopping point instead of pushing through it.';
    case 'Guided':
      return 'It is time to step away from the current activity for a moment.';
    default:
      return '';
  }
});

function unwrapProjection(value: unknown): InterventionWindowProjection | null {
  const result = value as Result<InterventionWindowProjection | null>;
  if (!result || result.ok !== true) return null;
  return result.data;
}

async function sendCommand(command: InterventionWindowCommand): Promise<void> {
  const bridge = getElectronBridge();
  if (!bridge) return;
  projection.value = unwrapProjection(
    await bridge.invoke(RoutineWindowChannels.INTERVENTION_WINDOW_COMMAND, command),
  );
  now.value = Date.now();
}

const onProjection = (value: unknown): void => {
  projection.value = value as InterventionWindowProjection;
  now.value = Date.now();
};

onMounted(async () => {
  const bridge = getElectronBridge();
  if (bridge) {
    projection.value = unwrapProjection(
      await bridge.invoke(RoutineWindowChannels.INTERVENTION_WINDOW_GET),
    );
    bridge.on(RoutineWindowChannels.INTERVENTION_WINDOW_PROJECTION, onProjection);
  }
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1_000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  timer = null;
  getElectronBridge()?.off(RoutineWindowChannels.INTERVENTION_WINDOW_PROJECTION, onProjection);
});
</script>

<style scoped>
.intervention-window {
  min-height: 100vh;
  overflow: hidden;
  color: #f4f4f5;
  background: radial-gradient(circle at top right, #17314a 0, #0b1118 48%, #09090b 100%);
  user-select: none;
}

.intervention-window.is-guided {
  background: radial-gradient(circle at top right, #214d3a 0, #0b1712 48%, #09090b 100%);
}

.intervention-window__drag-region {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  min-height: 50px;
  padding: 10px 14px 6px;
}

.intervention-window__identity {
  display: grid;
  gap: 2px;
}

.intervention-window__identity span {
  color: #a1a1aa;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.intervention-window__identity strong {
  font-size: 15px;
}

.intervention-window__body {
  display: grid;
  gap: 10px;
  padding: 8px 14px 14px;
}

.intervention-window__message,
.intervention-window__guided {
  margin: 0;
  color: #d4d4d8;
  font-size: 13px;
  line-height: 1.45;
}

.intervention-window__guided {
  padding: 9px 10px;
  border: 1px solid #365f4e;
  border-radius: 10px;
  background: #10241c;
}

.intervention-window__countdown {
  margin: 0;
  font-size: 28px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: -1px;
}

.intervention-window__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.no-drag,
button {
  -webkit-app-region: no-drag;
}

button {
  min-height: 30px;
  padding: 5px 9px;
  color: #e4e4e7;
  border: 1px solid #3f3f46;
  border-radius: 8px;
  background: #18181b;
  cursor: pointer;
  font-size: 12px;
}

button:hover {
  background: #27272a;
}

button.primary {
  border-color: #2563eb;
  background: #1d4ed8;
  color: #eff6ff;
}

.intervention-window__empty {
  padding: 18px;
  color: #a1a1aa;
}
</style>
