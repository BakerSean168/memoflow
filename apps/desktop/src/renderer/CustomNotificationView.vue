<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Eye, Check, Clock } from '@lucide/vue';
import { notificationSound } from '@memoflow/assets/audio';
import type { Result } from '@memoflow/transport-contracts/result';
import type {
  NotificationActionIntent,
  ExecuteNotificationActionRes,
  NotificationClientDTO,
} from '@memoflow/notification-contracts';
import { NotificationChannels, RendererEventChannels } from '@memoflow/desktop-contracts';
import { NOTIFICATION_ATTENTION_TABLES } from './platform/notification-attention-tables';
// Residual 911: local ElectronBridge dual retired — sole body from @memoflow/ipc-client.
// Residual 941: local getElectronBridge dual retired — sole host helper in platform/electron-bridge.
import { getElectronBridge } from './platform/electron-bridge';
import WindowActionButton from './components/WindowActionButton.vue';
import WindowNumberInput from './components/WindowNumberInput.vue';

const { t } = useI18n();

interface CustomNotification {
  id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: boolean;
  timeoutId?: number;
  shownAt?: number;
}

const notifications = ref<CustomNotification[]>([]);
const containerRef = ref<HTMLElement | null>(null);
const now = ref(Date.now());
const actionPending = ref<string | null>(null);
const actionError = ref<string | null>(null);
const snoozeOpen = ref<string | null>(null);
const snoozeMinutes = ref<number | string>(10);
let clockInterval: number | null = null;
let resizeTimer: number | null = null;
let refreshTimer: number | null = null;
let activeAudio: HTMLAudioElement | null = null;
let disposed = false;
const bridge = getElectronBridge();
if (!bridge) throw new Error('Custom notification requires the preload bridge');

const AUTO_DISMISS_MS = 30_000;
const MAX_VISIBLE_NOTIFICATIONS = 3;

function routineAction(notification: CustomNotification, commandKey: string) {
  const actions = notification.data?.actions;
  return Array.isArray(actions)
    ? (actions as NotificationActionIntent[]).find(
        (action) =>
          action.kind === 'owner-command' &&
          action.owner?.type === 'routine-occurrence' &&
          action.commandKey === commandKey,
      )
    : undefined;
}

function isRoutine(notification: CustomNotification): boolean {
  return (
    notification.data?.workflowKey === 'routine.intervention' &&
    !!routineAction(notification, 'routine.complete')
  );
}

async function closeNotification(notification: CustomNotification) {
  removeNotification(notification.id);
  if (!disposed) await bridge.invoke(NotificationChannels.CUSTOM_CLOSE, notification.id);
}

async function executeAction(
  notification: CustomNotification,
  commandKey: string,
  durationMs?: number,
) {
  const action = routineAction(notification, commandKey);
  if (!action || actionPending.value) return;
  actionPending.value = notification.id;
  actionError.value = null;
  if (notification.timeoutId !== undefined) window.clearTimeout(notification.timeoutId);
  try {
    const result = (await bridge.invoke(NotificationChannels.EXECUTE_ACTION, {
      notificationId: notification.data?.notificationId,
      actionKey: action.actionKey,
      ...(durationMs === undefined ? {} : { snoozeDurationMs: durationMs }),
    })) as Result<ExecuteNotificationActionRes>;
    if (!result?.ok || result.data.interaction.outcome !== 'accepted')
      throw new Error('Action rejected');
    await closeNotification(notification);
  } catch {
    actionError.value = notification.id;
  } finally {
    actionPending.value = null;
  }
}

async function acknowledgeNotification(notification: CustomNotification) {
  if (disposed || actionPending.value) return;
  actionPending.value = notification.id;
  actionError.value = null;
  if (notification.timeoutId !== undefined) window.clearTimeout(notification.timeoutId);
  try {
    const notificationId = notification.data?.notificationId;
    if (typeof notificationId === 'string') {
      const result = (await bridge.invoke(
        NotificationChannels.MARK_READ,
        notificationId,
      )) as Result<unknown>;
      if (!result?.ok) throw new Error('Mark read rejected');
    }
    await closeNotification(notification);
  } catch {
    actionError.value = notification.id;
  } finally {
    actionPending.value = null;
  }
}

function synchronizeClock() {
  const running = notifications.value.some(isRoutine) && document.visibilityState !== 'hidden';
  if (running && clockInterval === null) {
    now.value = Date.now();
    clockInterval = window.setInterval(() => {
      now.value = Date.now();
    }, 1_000);
  } else if (!running && clockInterval !== null) {
    window.clearInterval(clockInterval);
    clockInterval = null;
  }
}

const elapsedTimes = computed<Record<string, string>>(() =>
  Object.fromEntries(
    notifications.value.map((notification) => {
      const seconds = Math.floor(
        Math.max(0, now.value - (notification.shownAt ?? now.value)) / 1_000,
      );
      return [
        notification.id,
        String(Math.floor(seconds / 60)).padStart(2, '0') +
          ':' +
          String(seconds % 60).padStart(2, '0'),
      ];
    }),
  ),
);

function handleReceiveNotification(data: CustomNotification) {
  if (disposed || notifications.value.some((notification) => notification.id === data.id)) return;
  if (data.sound === true) void playNotificationSound(notificationSound);
  while (notifications.value.length >= MAX_VISIBLE_NOTIFICATIONS) {
    const oldest = notifications.value[0]!;
    // Visual overflow never changes the durable inbox or the routine owner.
    void closeNotification(oldest).catch(console.warn);
  }
  const notification = { ...data, shownAt: Date.now() };
  if (!isRoutine(notification)) {
    notification.timeoutId = window.setTimeout(() => {
      void closeNotification(notification).catch(console.warn);
    }, AUTO_DISMISS_MS);
  }
  notifications.value.push(notification);
}

async function playNotificationSound(src: string) {
  try {
    activeAudio?.pause();
    const audio = new Audio(src);
    activeAudio = audio;
    audio.addEventListener(
      'ended',
      () => {
        if (activeAudio === audio) activeAudio = null;
      },
      { once: true },
    );
    audio.volume = 0.6;
    await audio.play();
  } catch (error) {
    console.warn('[CustomNotificationView] Failed to play notification sound', error);
  }
}

function removeNotification(id: string) {
  const index = notifications.value.findIndex((notification) => notification.id === id);
  if (index === -1) return;
  const notification = notifications.value[index]!;
  if (notification.timeoutId !== undefined) window.clearTimeout(notification.timeoutId);
  if (snoozeOpen.value === id) snoozeOpen.value = null;
  notifications.value.splice(index, 1);
}

async function refreshVisibleNotifications() {
  const reads = await Promise.allSettled(
    [...notifications.value].map(async (notification) => {
      const id = notification.data?.notificationId;
      if (typeof id !== 'string') return;
      const result = (await bridge.invoke(
        NotificationChannels.GET,
        id,
      )) as Result<NotificationClientDTO>;
      if (disposed || !notifications.value.some((current) => current.id === notification.id))
        return;
      if (!result.ok) {
        if (result.error.code === 'NOT_FOUND') await closeNotification(notification);
        else return true;
        return;
      }
      const current = result.data;
      const newlyRead =
        current.isRead &&
        (!notification.data?.isRead || current.readAt !== notification.data?.readAt);
      if (
        newlyRead ||
        current.deletedAt != null ||
        current.archivedAt != null ||
        (isRoutine(notification) && current.needsAttention === false)
      ) {
        await closeNotification(notification);
      }
    }),
  );
  if (
    !disposed &&
    notifications.value.length > 0 &&
    refreshTimer === null &&
    reads.some((read) => read.status === 'rejected' || read.value === true)
  ) {
    scheduleVisibleRefresh(5_000);
  }
}

function scheduleVisibleRefresh(delay: number) {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    if (!disposed) void refreshVisibleNotifications();
  }, delay);
}

function handleDatabaseChanged(payload: unknown) {
  const tables = (payload as { tables?: string[] } | undefined)?.tables;
  if (!Array.isArray(tables) || !tables.some((table) => NOTIFICATION_ATTENTION_TABLES.has(table)))
    return;
  scheduleVisibleRefresh(80);
}

function toggleSnooze(id: string) {
  snoozeMinutes.value = 10;
  snoozeOpen.value = snoozeOpen.value === id ? null : id;
}

function applyCustomSnooze(notification: CustomNotification) {
  const minutes = Number(snoozeMinutes.value);
  if (Number.isSafeInteger(minutes) && minutes > 0 && minutes <= 525_600) {
    void executeAction(notification, 'routine.snooze', minutes * 60_000);
  }
}

async function updateWindowBounds() {
  await nextTick();
  if (disposed) return;
  if (resizeTimer !== null) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null;
    if (!containerRef.value) return;
    const height = notifications.value.length > 0 ? containerRef.value.scrollHeight : 0;
    const ids = notifications.value.map((notification) => notification.id);
    void bridge
      .invoke(NotificationChannels.CUSTOM_RESIZE, height)
      .then(async () => {
        if (disposed || height <= 0) return;
        for (const id of ids) {
          if (notifications.value.some((notification) => notification.id === id))
            await bridge.invoke(NotificationChannels.CUSTOM_PRESENTED, id);
        }
      })
      .catch(console.warn);
  }, 50);
}

watch(
  () => [notifications.value.length, snoozeOpen.value, actionError.value],
  () => {
    synchronizeClock();
    void updateWindowBounds();
  },
  { immediate: true, flush: 'sync' },
);

function handleMouseEnter() {
  void bridge.invoke(NotificationChannels.CUSTOM_MOUSE_ENTER).catch(console.warn);
}
function handleMouseLeave() {
  void bridge.invoke(NotificationChannels.CUSTOM_MOUSE_LEAVE).catch(console.warn);
}

onMounted(() => {
  for (const element of [document.documentElement, document.body, document.getElementById('app')]) {
    if (element) element.style.background = 'transparent';
  }
  document.body.style.overflow = 'hidden';
  document.addEventListener('visibilitychange', synchronizeClock);
  bridge.on(NotificationChannels.CUSTOM_RECEIVE, handleReceiveNotification);
  bridge.on(RendererEventChannels.DB_CHANGED, handleDatabaseChanged);
  void bridge.invoke(NotificationChannels.CUSTOM_RENDERER_READY).catch(console.warn);
});

onUnmounted(() => {
  disposed = true;
  document.removeEventListener('visibilitychange', synchronizeClock);
  bridge.off(NotificationChannels.CUSTOM_RECEIVE, handleReceiveNotification);
  bridge.off(RendererEventChannels.DB_CHANGED, handleDatabaseChanged);
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  if (resizeTimer !== null) window.clearTimeout(resizeTimer);
  activeAudio?.pause();
  notifications.value.forEach((notification) => {
    if (notification.timeoutId !== undefined) window.clearTimeout(notification.timeoutId);
  });
  if (clockInterval !== null) window.clearInterval(clockInterval);
});
</script>

<template>
  <div
    ref="containerRef"
    class="pointer-events-none flex min-h-2.5 w-full flex-col gap-2 bg-transparent p-2"
  >
    <TransitionGroup name="notification-list" @after-leave="updateWindowBounds">
      <div
        v-for="notification in notifications"
        :key="notification.id"
        :data-notification-id="notification.id"
        class="pointer-events-auto overflow-hidden rounded-xl border border-white/15 bg-slate-950/95 px-3 py-2.5 text-white shadow-lg"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave"
      >
        <WindowActionButton
          variant="ghost"
          type="button"
          class="block w-full truncate rounded text-left text-sm font-semibold leading-5 text-slate-50 focus-visible:outline focus-visible:outline-1"
          :title="notification.title"
          data-testid="notification-open"
          @click="bridge.invoke(NotificationChannels.CUSTOM_CLICK, notification.id)"
        >
          {{ notification.title }}
        </WindowActionButton>
        <div
          v-if="notification.body"
          class="mt-0.5 truncate text-xs leading-5 text-slate-300"
          :title="notification.body"
        >
          {{ notification.body }}
        </div>
        <div class="mt-1.5 flex items-center justify-between gap-2">
          <span data-testid="notification-elapsed" class="text-xs tabular-nums text-slate-400">
            <template v-if="isRoutine(notification)">{{
              t('notification.custom.elapsed', { time: elapsedTimes[notification.id] })
            }}</template>
          </span>
          <div class="flex items-center gap-1">
            <WindowActionButton
              variant="ghost"
              class="h-8 w-8 p-0 text-slate-300 hover:bg-white/10 hover:text-white"
              data-testid="notification-read"
              :aria-label="t('notification.custom.markReadClose')"
              :title="t('notification.custom.markReadClose')"
              :disabled="!!actionPending"
              @click="acknowledgeNotification(notification)"
              ><Eye class="h-4 w-4" aria-hidden="true"
            /></WindowActionButton>
            <WindowActionButton
              v-if="routineAction(notification, 'routine.complete')"
              variant="ghost"
              class="h-8 w-8 p-0 text-emerald-300 hover:bg-emerald-400/15 hover:text-emerald-200"
              data-testid="notification-complete"
              :aria-label="t('notification.custom.actionComplete')"
              :title="t('notification.custom.actionComplete')"
              :disabled="!!actionPending"
              @click="executeAction(notification, 'routine.complete')"
              ><Check class="h-4 w-4" aria-hidden="true"
            /></WindowActionButton>
            <WindowActionButton
              v-if="routineAction(notification, 'routine.snooze')"
              variant="ghost"
              class="h-8 w-8 p-0 text-slate-300 hover:bg-white/10 hover:text-white"
              data-testid="notification-snooze"
              :aria-label="t('notification.action.snoozeApply')"
              :title="t('notification.action.snoozeApply')"
              :aria-expanded="snoozeOpen === notification.id"
              :disabled="!!actionPending"
              @click="toggleSnooze(notification.id)"
              ><Clock class="h-4 w-4" aria-hidden="true"
            /></WindowActionButton>
          </div>
        </div>
        <form
          v-if="snoozeOpen === notification.id"
          class="mt-2 border-t border-white/10 pt-2"
          @submit.prevent="applyCustomSnooze(notification)"
          @keydown.esc.stop="snoozeOpen = null"
        >
          <div class="flex flex-wrap gap-1">
            <WindowActionButton
              variant="ghost"
              v-for="minutes in [10, 60, 180, 1440, 10080]"
              :key="minutes"
              type="button"
              class="rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-1"
              :disabled="!!actionPending"
              @click="executeAction(notification, 'routine.snooze', minutes * 60_000)"
            >
              {{
                t(
                  minutes === 10
                    ? 'notification.action.snooze10m'
                    : minutes === 60
                      ? 'notification.action.snooze1h'
                      : minutes === 180
                        ? 'notification.action.snooze3h'
                        : minutes === 1440
                          ? 'notification.action.snoozeTomorrow'
                          : 'notification.action.snoozeNextWeek',
                )
              }}
            </WindowActionButton>
          </div>
          <div class="mt-1 flex items-center gap-2">
            <WindowNumberInput
              v-model.number="snoozeMinutes"
              data-testid="notification-snooze-minutes"
              type="number"
              min="1"
              max="525600"
              step="1"
              required
              :aria-label="t('notification.action.snoozeMinutes')"
              class="h-7 min-w-0 flex-1 rounded border border-white/20 bg-transparent px-2 text-xs text-white"
            />
            <span class="text-xs text-slate-400">{{ t('notification.action.snoozeMinutes') }}</span>
            <WindowActionButton
              variant="ghost"
              type="submit"
              data-testid="notification-snooze-apply"
              :disabled="!!actionPending"
              :aria-label="t('notification.action.snoozeApply')"
              :title="t('notification.action.snoozeApply')"
              class="flex h-8 w-8 items-center justify-center rounded text-slate-200 hover:bg-white/10"
            >
              <Check class="h-4 w-4" aria-hidden="true" />
            </WindowActionButton>
          </div>
        </form>
        <p v-if="actionError === notification.id" role="alert" class="mt-1 text-xs text-rose-300">
          {{ t('notification.custom.actionFailed') }}
        </p>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app),
:global(#app > *) {
  background: transparent !important;
}
:global(body) {
  overflow: hidden !important;
}
.notification-list-enter-active,
.notification-list-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}
.notification-list-enter-from,
.notification-list-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
</style>
