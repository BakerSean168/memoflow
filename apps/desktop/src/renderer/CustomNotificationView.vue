<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { notificationSound } from '@memoflow/assets/audio';
import { NotificationChannels } from '@memoflow/contracts/electron';
// Residual 911: local ElectronBridge dual retired — sole body from @memoflow/ipc-client.
// Residual 941: local getElectronBridge dual retired — sole host helper in platform/electron-bridge.
import { getElectronBridge } from './platform/electron-bridge';

interface CustomNotification {
  id: string;
  title: string;
  body: string;
  icon?: string;
  urgency?: 'normal' | 'critical' | 'low';
  data?: Record<string, unknown>;
  sound?: {
    enabled: boolean;
    name?: string | null;
  } | null;
  timeoutId?: number;
}

const notifications = ref<CustomNotification[]>([]);
const containerRef = ref<HTMLElement | null>(null);
const now = ref(Date.now());
let clockInterval: number | null = null;

const AUTO_DISMISS_MS = 30_000;

const notificationProgress = computed<Record<string, number>>(() => {
  return Object.fromEntries(
    notifications.value.map((notification) => {
      const createdAt = Number(notification.data?.createdAt ?? now.value);
      const elapsed = Math.max(0, now.value - createdAt);
      const remaining = Math.max(0, AUTO_DISMISS_MS - elapsed);
      return [notification.id, remaining / AUTO_DISMISS_MS];
    }),
  );
});

const notificationRemainingSeconds = computed<Record<string, number>>(() => {
  return Object.fromEntries(
    notifications.value.map((notification) => {
      const createdAt = Number(notification.data?.createdAt ?? now.value);
      const elapsed = Math.max(0, now.value - createdAt);
      const remaining = Math.max(0, AUTO_DISMISS_MS - elapsed);
      return [notification.id, Math.ceil(remaining / 1000)];
    }),
  );
});

function handleReceiveNotification(data: CustomNotification) {
  console.info('[CustomNotificationView] Received notification payload', {
    id: data.id,
    title: data.title,
    hasBody: !!data.body,
  });
  // If we already have one with this ID, ignore
  if (notifications.value.some((n) => n.id === data.id)) return;

  const soundEnabled = data.sound?.enabled ?? true;
  if (soundEnabled) {
    if (data.sound?.name && typeof data.sound.name === 'string') {
      void playNotificationSound(data.sound.name);
    } else {
      void playNotificationSound(notificationSound);
    }
  }

  // Add timeout for auto dismiss
  const timeoutId = window.setTimeout(() => {
    void acknowledgeNotification(data, 'timeout');
  }, AUTO_DISMISS_MS);

  notifications.value.push({
    ...data,
    timeoutId,
    data: {
      ...data.data,
      createdAt: data.data?.createdAt ?? Date.now(),
    },
  });
}

async function playNotificationSound(src: string) {
  try {
    const audio = new Audio(src);
    audio.volume = 0.6;
    await audio.play();
  } catch (error) {
    console.warn('[CustomNotificationView] Failed to play notification sound', error);
  }
}

function removeNotification(id: string) {
  const index = notifications.value.findIndex((n) => n.id === id);
  if (index !== -1) {
    console.info('[CustomNotificationView] Removing notification', { id });
    const n = notifications.value[index];
    if (n.timeoutId) clearTimeout(n.timeoutId);
    notifications.value.splice(index, 1);
  }
}

async function acknowledgeNotification(
  notification: CustomNotification,
  source: 'button' | 'timeout',
) {
  console.info('[CustomNotificationView] Acknowledging notification', {
    id: notification.id,
    source,
    notificationId: notification.data?.notificationId,
  });

  const notificationId =
    typeof notification.data?.notificationId === 'string' ? notification.data.notificationId : null;

  removeNotification(notification.id);

  if (notificationId) {
    try {
      await getElectronBridge().invoke(NotificationChannels.MARK_READ, notificationId);
    } catch (error) {
      console.error('[CustomNotificationView] Failed to mark notification as read', error);
    }
  }

  await getElectronBridge().invoke(NotificationChannels.CUSTOM_CLOSE, notification.id);
}

// Helper to recalculate window bounds after a short delay to account for transitions
async function updateWindowBounds() {
  await nextTick();
  // Slight delay to allow transition classes to apply/finish if needed
  setTimeout(() => {
    if (containerRef.value) {
      const height = notifications.value.length > 0 ? containerRef.value.scrollHeight : 0;
      console.info('[CustomNotificationView] Requesting window resize', {
        notificationCount: notifications.value.length,
        height,
      });
      getElectronBridge().invoke(NotificationChannels.CUSTOM_RESIZE, height);
    }
  }, 50);
}

// Watch for changes in the notification list to trigger window resize
watch(
  () => notifications.value.length,
  async () => {
    updateWindowBounds();
  },
  { immediate: true },
);

function handleMouseEnter() {
  getElectronBridge().invoke(NotificationChannels.CUSTOM_MOUSE_ENTER);
}

function handleMouseLeave() {
  getElectronBridge().invoke(NotificationChannels.CUSTOM_MOUSE_LEAVE);
}

onMounted(() => {
  document.documentElement.style.background = 'transparent';
  document.documentElement.style.backgroundColor = 'transparent';
  document.body.style.background = 'transparent';
  document.body.style.backgroundColor = 'transparent';
  document.body.style.overflow = 'hidden';
  const appRoot = document.getElementById('app');
  if (appRoot) {
    appRoot.style.background = 'transparent';
    appRoot.style.backgroundColor = 'transparent';
  }

  clockInterval = window.setInterval(() => {
    now.value = Date.now();
  }, 100);

  console.info('[CustomNotificationView] Mounted', {
    hasElectronApi: !!getElectronBridge(),
  });
  if (getElectronBridge()) {
    getElectronBridge().on(NotificationChannels.CUSTOM_RECEIVE, handleReceiveNotification);
    getElectronBridge()
      .invoke(NotificationChannels.CUSTOM_RENDERER_READY)
      .then(() => {
        console.info('[CustomNotificationView] Renderer ready acknowledged by main process');
      })
      .catch((error: unknown) => {
        console.error('[CustomNotificationView] Failed to notify renderer-ready', error);
      });
  }
});

onUnmounted(() => {
  if (getElectronBridge()) {
    getElectronBridge().off(
      NotificationChannels.CUSTOM_RECEIVE,
      handleReceiveNotification,
    );
  }
  // Clear any remaining timeouts
  notifications.value.forEach((n) => {
    if (n.timeoutId) clearTimeout(n.timeoutId);
  });
  if (clockInterval !== null) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
});
</script>

<template>
  <div
    ref="containerRef"
    class="flex flex-col gap-3 bg-transparent p-3 pointer-events-none"
    style="width: 100%; min-height: 10px"
  >
    <TransitionGroup name="notification-list" @after-leave="updateWindowBounds">
      <div
        v-for="notification in notifications"
        :key="notification.id"
        class="pointer-events-auto relative overflow-hidden rounded-[22px] border border-white/15 bg-slate-950/92 p-5 text-white shadow-[0_20px_60px_rgba(15,23,42,0.45)] backdrop-blur-xl"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave"
      >
        <div
          class="absolute inset-x-0 top-0 h-1 origin-left bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 transition-transform duration-100 ease-linear"
          :style="{ transform: `scaleX(${notificationProgress[notification.id] ?? 0})` }"
        />

        <div class="flex items-start gap-4">
          <div
            class="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400/16 text-amber-300 ring-1 ring-amber-300/20"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M10.268 21a2 2 0 0 0 3.464 0" />
              <path
                d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .738-1.674C19.41 13.86 18 12.127 18 8A6 6 0 0 0 6 8c0 4.127-1.411 5.86-2.738 7.326"
              />
            </svg>
          </div>

          <div class="min-w-0 flex-1">
            <div class="mb-2 flex items-center gap-2">
              <span
                class="inline-flex items-center rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[11px] font-medium tracking-[0.18em] text-amber-200"
              >
                REMINDER
              </span>
              <span class="text-xs text-slate-400">30s 内未处理将自动标记为已读</span>
            </div>

            <div class="text-base font-semibold leading-6 text-slate-50">
              {{ notification.title }}
            </div>
            <div
              v-if="notification.body"
              class="mt-2 text-sm leading-6 text-slate-300"
            >
              {{ notification.body }}
            </div>
            <div v-else class="mt-2 text-sm leading-6 text-slate-400">
              提醒已触发，请确认已收到。
            </div>

            <div class="mt-4 flex items-center justify-between gap-3">
              <div class="text-xs text-slate-500">
                {{ notificationRemainingSeconds[notification.id] ?? 0 }}s
              </div>

              <button
                type="button"
                class="inline-flex min-w-[92px] items-center justify-center rounded-xl bg-amber-400 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-amber-300"
                @click="void acknowledgeNotification(notification, 'button')"
              >
                收到
              </button>
            </div>
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
/* Ensure the body doesn't add its own scrollbars */
:global(body) {
  overflow: hidden !important;
  background-color: transparent !important;
  background: transparent !important;
}
:global(#app) {
  background-color: transparent !important;
  background: transparent !important;
}
:global(html) {
  background-color: transparent !important;
  background: transparent !important;
}
:global(#app > *) {
  background: transparent !important;
}

.notification-list-enter-active,
.notification-list-leave-active {
  transition: all 0.28s ease;
}
.notification-list-enter-from {
  opacity: 0;
  transform: translateX(20px) translateY(8px) scale(0.97);
}
.notification-list-leave-to {
  opacity: 0;
  transform: translateX(16px) scale(0.96);
}
</style>
