<template>
  <Teleport to="body">
    <TransitionGroup
      name="notification-slide"
      tag="div"
      class="fixed top-5 right-5 z-[10000] pointer-events-none"
    >
      <div
        v-for="notification in notifications"
        :key="notification.id"
        :class="[
          'flex items-start gap-3 min-w-[320px] max-w-[400px] p-4 mb-3',
          'rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-overlay)/0.96)] shadow-[0_18px_46px_-24px_rgba(0,0,0,0.62),inset_0_1px_0_hsl(var(--foreground)/0.03)] backdrop-blur-xl pointer-events-auto',
          'transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-px hover:bg-[hsl(var(--surface-overlay))] hover:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.68),inset_0_1px_0_hsl(var(--foreground)/0.03)]',
          priorityBorderClass(notification.priority),
          notification.priority === 'URGENT' && 'animate-pulse-shadow',
        ]"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="notification.title"
          @click="$emit('notification-click', notification)"
        >
          <!-- Icon -->
          <div class="shrink-0 w-6 h-6 text-2xl leading-none" aria-hidden="true">
            {{ getIcon(notification.type) }}
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-foreground mb-1 truncate">
              {{ notification.title }}
            </div>
            <div class="text-sm text-muted-foreground leading-relaxed break-words">
              {{ notification.message }}
            </div>
          </div>
        </button>

        <!-- Close Button -->
        <Button
          variant="ghost"
          size="icon"
          :aria-label="t('common.close')"
          class="shrink-0 h-5 w-5 text-muted-foreground hover:text-foreground"
          @click.stop="$emit('close', notification.id)"
        >
          <X class="h-4 w-4" />
        </Button>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import { X } from '@lucide/vue';
import type { NotificationItem } from './types';

const { t } = useI18n();

interface Props {
  notifications: NotificationItem[];
}

defineProps<Props>();

defineEmits<{
  'notification-click': [notification: NotificationItem];
  close: [id: string];
}>();

function getIcon(type: string): string {
  const icons: Record<string, string> = {
    REMINDER: '🔔',
    TASK: '✅',
    GOAL: '🎯',
    SYSTEM: '⚙️',
    SCHEDULE: '📅',
  };
  return icons[type] || '🔔';
}

function priorityBorderClass(priority: string): string {
  const classes: Record<string, string> = {
    LOW: 'border-l-4 border-l-gray-400',
    NORMAL: 'border-l-4 border-l-blue-500',
    HIGH: 'border-l-4 border-l-orange-500',
    URGENT: 'border-l-4 border-l-red-500',
  };
  return classes[priority] || classes.NORMAL;
}
</script>

<style scoped>
/* Animation for entering notifications */
.notification-slide-enter-active,
.notification-slide-leave-active {
  transition: all 0.3s ease;
}

.notification-slide-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.notification-slide-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.notification-slide-move {
  transition: transform 0.3s ease;
}

/* Pulse animation for urgent notifications */
@keyframes pulse-shadow {
  0%,
  100% {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  50% {
    box-shadow: 0 4px 12px rgba(245, 108, 108, 0.4);
  }
}

.animate-pulse-shadow {
  animation: pulse-shadow 1s infinite;
}
</style>
