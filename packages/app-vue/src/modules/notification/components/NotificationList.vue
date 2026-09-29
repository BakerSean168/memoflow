<template>
  <div
    class="notification-list overflow-hidden rounded-xl border border-border/60 bg-card/30 shadow-sm"
    data-testid="notification-list"
  >
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <Loader2 class="h-8 w-8 animate-spin text-primary" />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="!notifications.length"
      class="flex flex-col items-center justify-center py-12 text-center"
    >
      <Bell class="h-12 w-12 text-muted-foreground mb-3" />
      <p class="text-sm text-muted-foreground">{{ t('notification.empty') }}</p>
    </div>

    <!-- Notification List -->
    <div v-else class="divide-y divide-border/60" data-testid="notifications-list">
      <slot
        v-for="notification in notifications"
        :key="notification.id"
        :notification="notification"
      >
        <!-- Default notification item rendering -->
        <NotificationItem
          :notification="notification"
          @click="$emit('notification-click', $event)"
          @mark-read="$emit('mark-read', $event)"
          @execute-action="$emit('execute-action', $event)"
          @delete="$emit('delete', $event)"
        />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Loader2, Bell } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import NotificationItem from './NotificationItem.vue';
import type { NotificationClientDTO } from '@memoflow/contracts/notification';

interface Props {
  notifications: NotificationClientDTO[];
  loading?: boolean;
}

withDefaults(defineProps<Props>(), {
  loading: false,
});

const { t } = useI18n();

defineEmits<{
  'notification-click': [notification: NotificationClientDTO];
  'mark-read': [id: string];
  'execute-action': [input: { notificationId: string; actionKey: string }];
  delete: [id: string];
}>();
</script>
