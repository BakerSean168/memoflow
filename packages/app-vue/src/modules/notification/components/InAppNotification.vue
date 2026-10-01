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
          'rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-overlay)/0.96)] backdrop-blur-xl pointer-events-auto',
          'transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-px hover:bg-[hsl(var(--surface-overlay))]',
          semanticElevationClass('floating-interactive'),
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
import { semanticElevationClass } from '../../../shared/constants/semantic-elevation';
import {
  semanticToneBorderClass,
  type SemanticTone,
} from '../../../shared/constants/semantic-tone';

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
  const tones: Record<string, SemanticTone> = {
    LOW: 'muted',
    NORMAL: 'info',
    HIGH: 'warning',
    URGENT: 'destructive',
  };
  return `border-l-4 ${semanticToneBorderClass(tones[priority] ?? 'info')}`;
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
    box-shadow: 0 4px 12px hsl(var(--foreground) / 0.14);
  }
  50% {
    box-shadow: 0 4px 12px hsl(var(--destructive) / 0.34);
  }
}

.animate-pulse-shadow {
  animation: pulse-shadow 1s infinite;
}
</style>
