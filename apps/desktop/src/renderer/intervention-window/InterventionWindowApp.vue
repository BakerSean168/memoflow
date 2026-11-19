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
        <WindowActionButton variant="primary" @click="sendCommand({ action: 'complete' })">
          {{
            projection.state === 'Guided'
              ? t('routine.intervention.completeBreak')
              : t('routine.intervention.done')
          }}
        </WindowActionButton>
        <WindowActionButton @click="sendCommand({ action: 'snooze', durationMs: 300_000 })">
          {{ t('routine.intervention.snooze5m') }}
        </WindowActionButton>
        <WindowActionButton
          :aria-label="t('routine.intervention.dismissAria')"
          @click="sendCommand({ action: 'dismiss' })"
        >
          {{ t('routine.intervention.dismiss') }}
        </WindowActionButton>
      </div>
    </section>

    <section v-else class="intervention-window__empty" data-testid="intervention-empty">
      <p class="intervention-window__empty-title">{{ t('routine.intervention.emptyTitle') }}</p>
      <p class="intervention-window__empty-description">
        {{ t('routine.intervention.emptyDescription') }}
      </p>
      <WindowActionButton @click="closeWindow">
        {{ t('routine.intervention.closeWindow') }}
      </WindowActionButton>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  RoutineWindowChannels,
  WindowChannels,
  type InterventionWindowCommand,
  type InterventionWindowProjection,
} from '@memoflow/desktop-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import { getElectronBridge } from '../platform/electron-bridge';
import WindowActionButton from '../components/WindowActionButton.vue';

const { t } = useI18n();

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

// The empty state has no occurrence to dismiss, so it uses the shared window
// control channel instead of the intervention command surface.
function closeWindow(): void {
  void getElectronBridge()?.invoke(WindowChannels.CLOSE);
}

const onProjection = (value: unknown): void => {
  projection.value = value as InterventionWindowProjection;
  now.value = Date.now();
};

// The window may initially focus document.body rather than an action button.
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || !projection.value)
    return;
  event.preventDefault();
  event.stopPropagation();
  void sendCommand({ action: 'dismiss' });
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
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
  window.removeEventListener('keydown', onKeydown);
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

.no-drag {
  -webkit-app-region: no-drag;
}

.intervention-window__empty {
  display: grid;
  justify-items: start;
  gap: 8px;
  padding: 18px;
  color: #a1a1aa;
}

.intervention-window__empty-title {
  margin: 0;
  color: #e4e4e7;
  font-size: 13px;
  font-weight: 600;
}

.intervention-window__empty-description {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}
</style>
