<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Eye, Check, Clock } from '@lucide/vue';
import WindowActionButton from './components/WindowActionButton.vue';
import WindowNumberInput from './components/WindowNumberInput.vue';
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

const { t } = useI18n();

interface CustomNotification {
  id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
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
      <section
        v-for="notification in notifications"
        :key="notification.id"
        :data-notification-id="notification.id"
        class="notification-card pointer-events-auto"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave"
      >
        <header class="notification-card__header">
          <WindowActionButton
            variant="ghost"
            type="button"
            class="notification-card__title"
            :title="notification.title"
            data-testid="notification-open"
            @click="bridge.invoke(NotificationChannels.CUSTOM_CLICK, notification.id)"
          >
            {{ notification.title }}
          </WindowActionButton>
        </header>
        <p v-if="notification.body" class="notification-card__body" :title="notification.body">
          {{ notification.body }}
        </p>
        <footer class="notification-card__footer">
          <span
            v-if="isRoutine(notification)"
            data-testid="notification-elapsed"
            class="notification-card__elapsed"
          >
            {{ t('notification.custom.elapsed', { time: elapsedTimes[notification.id] }) }}
          </span>
          <div class="notification-card__actions">
            <WindowActionButton
              variant="ghost"
              type="button"
              class="notification-card__icon-button"
              data-testid="notification-read"
              :aria-label="t('notification.custom.markReadClose')"
              :title="t('notification.custom.markReadClose')"
              :disabled="!!actionPending"
              @click="acknowledgeNotification(notification)"
            >
              <Eye :size="16" :stroke-width="1.8" aria-hidden="true" />
            </WindowActionButton>
            <WindowActionButton
              variant="ghost"
              v-if="routineAction(notification, 'routine.complete')"
              type="button"
              class="notification-card__icon-button notification-card__icon-button--complete"
              data-testid="notification-complete"
              :aria-label="t('notification.custom.actionComplete')"
              :title="t('notification.custom.actionComplete')"
              :disabled="!!actionPending"
              @click="executeAction(notification, 'routine.complete')"
            >
              <Check :size="16" :stroke-width="1.8" aria-hidden="true" />
            </WindowActionButton>
            <WindowActionButton
              variant="ghost"
              v-if="routineAction(notification, 'routine.snooze')"
              type="button"
              class="notification-card__icon-button"
              data-testid="notification-snooze"
              :aria-label="t('notification.action.snoozeApply')"
              :title="t('notification.action.snoozeApply')"
              :aria-expanded="snoozeOpen === notification.id"
              :disabled="!!actionPending"
              @click="toggleSnooze(notification.id)"
            >
              <Clock :size="16" :stroke-width="1.8" aria-hidden="true" />
            </WindowActionButton>
          </div>
        </footer>
        <form
          v-if="snoozeOpen === notification.id"
          class="notification-card__snooze"
          @submit.prevent="applyCustomSnooze(notification)"
          @keydown.esc.stop="snoozeOpen = null"
        >
          <div class="notification-card__quick-options">
            <WindowActionButton
              variant="ghost"
              v-for="minutes in [10, 60, 180, 1440, 10080]"
              :key="minutes"
              type="button"
              class="notification-card__quick-option"
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
          <div class="notification-card__custom-snooze">
            <WindowNumberInput
              v-model.number="snoozeMinutes"
              data-testid="notification-snooze-minutes"
              type="number"
              min="1"
              max="525600"
              step="1"
              required
              :aria-label="t('notification.action.snoozeMinutes')"
              class="notification-card__minutes-input"
            />
            <span class="notification-card__minutes-label">
              {{ t('notification.action.snoozeMinutes') }}
            </span>
            <WindowActionButton
              variant="ghost"
              type="submit"
              data-testid="notification-snooze-apply"
              :disabled="!!actionPending"
              :aria-label="t('notification.action.snoozeApply')"
              class="notification-card__snooze-submit"
            >
              {{ t('notification.action.snoozeApply') }}
            </WindowActionButton>
          </div>
        </form>
        <p v-if="actionError === notification.id" role="alert" class="notification-card__error">
          {{ t('notification.custom.actionFailed') }}
        </p>
      </section>
    </TransitionGroup>
  </div>
</template>

<style scoped src="./styles/custom-notification.css"></style>
