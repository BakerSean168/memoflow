<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden" data-testid="notification-center">
    <!-- 与 Goal / Task 共用 ModuleHeader：筛选、计数、批量动作只占一层。 -->
    <ModuleHeader data-testid="notification-page-toolbar">
      <template #leading>
        <div
          class="inline-flex h-8 min-w-0 items-center rounded-lg bg-[hsl(var(--surface-raised)/0.55)] p-0.5 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.55)]"
        role="tablist"
        :aria-label="t('notification.title')"
      >
        <Button
          v-for="tab in filterTabs"
          :key="tab.value"
          :data-testid="`notification-filter-${tab.value}`"
          variant="ghost"
          size="sm"
          role="tab"
          :aria-selected="selectedFilter === tab.value"
          :class="[
            'h-7 gap-1.5 rounded-md px-2.5 text-xs font-medium shadow-none transition-[background-color,color,box-shadow] hover:bg-[hsl(var(--hover))] hover:text-foreground',
            selectedFilter === tab.value
              ? 'bg-[hsl(var(--surface-overlay))] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.65)]'
              : 'text-[hsl(var(--foreground-muted))]',
          ]"
          @click="selectedFilter = tab.value"
        >
          <span>{{ tab.label }}</span>
          <span
            :data-testid="
              tab.value === 'unread' && tab.count > 0 ? 'notification-unread-badge' : undefined
            "
            class="min-w-4 text-center text-[10px] tabular-nums"
            :class="
              selectedFilter === tab.value ? 'text-foreground/65' : 'text-muted-foreground/70'
            "
          >
            {{ tab.count }}
          </span>
        </Button>
        </div>
      </template>

      <template #actions>
        <Button
        data-testid="mark-all-read-button"
        variant="ghost"
        size="sm"
        class="h-8 shrink-0 gap-1.5 px-2.5 text-xs text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--hover))] hover:text-foreground"
        :aria-label="t('notification.action.markAllRead')"
        :disabled="!hasUnread"
        @click="handleMarkAllRead"
      >
        <CheckCheck class="h-3.5 w-3.5" />
        <span class="hidden @lg/panel:inline">{{ t('notification.action.markAllRead') }}</span>
        </Button>
      </template>
    </ModuleHeader>

    <!-- 信箱保持阅读宽度，略放宽到 5xl 以匹配 Goal / Task 的主内容列。 -->
    <div
      class="min-h-0 flex-1 overflow-y-auto px-4 py-3 @2xl/panel:px-6"
      data-testid="notification-scroll-host"
      data-scroll-host="notification"
    >
      <div class="mx-auto max-w-5xl">
        <!-- 加载 = 行骨架（§0.3 禁整页 spinner） -->
        <div
          v-if="isLoading"
          class="overflow-hidden rounded-xl bg-[hsl(var(--surface-raised)/0.24)] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.48)]"
          data-testid="notification-list-skeleton"
          role="status"
          :aria-label="t('notification.loading')"
        >
          <div
            v-for="i in 6"
            :key="i"
            class="flex items-start gap-3 border-b border-[hsl(var(--border-subtle))] px-4 py-3.5 last:border-b-0"
          >
            <Skeleton class="h-9 w-9 shrink-0 rounded-lg" />
            <div class="min-w-0 flex-1 space-y-2 pt-0.5">
              <div class="flex items-center justify-between gap-6">
                <Skeleton class="h-3.5 w-2/5" />
                <Skeleton class="h-3 w-14" />
              </div>
              <Skeleton class="h-3 w-4/5" />
              <Skeleton class="h-3 w-1/3" />
            </div>
          </div>
        </div>

        <div
          v-else-if="isError"
          class="flex min-h-72 flex-col items-center justify-center px-6 text-center"
          data-testid="notifications-error-state"
          role="alert"
        >
          <div
            class="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-destructive/15 bg-destructive/5 text-destructive"
          >
            <CircleAlert class="h-5 w-5" />
          </div>
          <p class="text-sm font-medium text-foreground">
            {{ t('notification.error.fetchFailed') }}
          </p>
          <p class="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            {{ t('notification.error.fetchFailedDescription') }}
          </p>
          <Button
            variant="outline"
            size="sm"
            class="mt-4 h-8"
            data-testid="notifications-retry"
            @click="refetch"
          >
            <RefreshCw class="mr-1.5 h-3.5 w-3.5" />
            {{ t('notification.action.retry') }}
          </Button>
        </div>

        <!-- 空态保持克制：不铺大卡片，不用高饱和成功色，只提供一个清晰的完成状态锚点。 -->
        <template v-else-if="filteredNotifications.length === 0">
          <div
            v-if="selectedFilter === 'unread'"
            class="flex min-h-[22rem] flex-col items-center justify-center px-6 text-center"
            data-testid="notifications-unread-empty"
          >
            <div
              class="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-success/5 text-success/80 shadow-[inset_0_0_0_1px_hsl(var(--success)/0.14)]"
            >
              <CheckCheck class="h-5 w-5" />
            </div>
            <p class="text-sm font-medium text-foreground">{{ t('notification.allCaughtUp') }}</p>
            <p class="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              {{ t('notification.unreadEmptyDescription') }}
            </p>
          </div>
          <div
            v-else
            class="flex min-h-[22rem] flex-col items-center justify-center px-6 text-center"
            data-testid="notifications-empty-state"
          >
            <div
              class="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--surface-raised)/0.42)] text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.52)]"
            >
              <Bell class="h-5 w-5" />
            </div>
            <p class="text-sm font-medium text-foreground">{{ t('notification.empty') }}</p>
            <p class="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              {{ t('notification.emptyDescription') }}
            </p>
          </div>
        </template>

        <div v-else data-testid="notifications-list">
          <NotificationList
            :notifications="filteredNotifications"
            :loading="isLoading"
            @mark-read="handleMarkRead"
            @execute-action="handleExecuteAction"
            @delete="handleDelete"
            @notification-click="handleNotificationClick"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { Bell, CheckCheck, CircleAlert, RefreshCw } from '@lucide/vue';
import { Button, Skeleton } from '@memoflow/ui-vue-shadcn';
import ModuleHeader from '../../../components/shared/ModuleHeader.vue';
import NotificationList from '../components/NotificationList.vue';
import { useNotificationListQuery } from '../composables/useNotificationListQuery';
import { useNotificationUnreadQuery } from '../composables/useNotificationUnreadQuery';
import { useNotificationMutations } from '../composables/useNotificationMutations';
import { useNotificationStore } from '../stores/notification-store';
import type { NotificationClientDTO } from '@memoflow/contracts/notification';
import { resolveNotificationDestination } from '../desktop/notification-click-navigation';

const { notifications, isLoading, isError, refetch } = useNotificationListQuery();
const { unreadCount, hasUnread } = useNotificationUnreadQuery();
const { markAsRead, markAllAsRead, dismiss, executeAction } = useNotificationMutations();

const store = useNotificationStore();

const { t } = useI18n();
const router = useRouter();

// 过滤收敛为 全部/未读 两态（§11-5；「已读」不是信箱高频动作）；read filter 是 UI state。
const selectedFilter = computed({
  get: () => store.readFilter,
  set: (value: 'all' | 'unread') => store.setReadFilter(value),
});

const filterTabs = computed(() => [
  {
    label: t('notification.filter.all'),
    value: 'all' as const,
    count: notifications.value.length,
  },
  {
    label: t('notification.filter.unread'),
    value: 'unread' as const,
    count: unreadCount.value,
  },
]);

const filteredNotifications = computed(() => {
  if (selectedFilter.value === 'unread') return notifications.value.filter((n) => !n.isRead);
  return notifications.value;
});

function handleNotificationClick(notification: NotificationClientDTO) {
  if (!notification.isRead) {
    markAsRead.mutate(notification.id);
  }
  void router.push(resolveNotificationDestination(notification)).catch(() => undefined);
}

async function handleMarkRead(id: string) {
  await markAsRead.mutateAsync(id);
}

async function handleMarkAllRead() {
  await markAllAsRead.mutateAsync();
  toast.success(t('notification.toast.allMarkedRead'));
}

async function handleExecuteAction(input: { notificationId: string; actionKey: string }) {
  try {
    const result = await executeAction.mutateAsync(input);
    if (result.interaction.outcome !== 'accepted') {
      toast.error(t('notification.toast.actionRejected'));
      return;
    }
    if (input.actionKey === 'complete') {
      toast.success(t('notification.toast.routineCompleted'));
      return;
    }
    if (input.actionKey.startsWith('snooze')) {
      toast.success(t('notification.toast.routineSnoozed'));
      return;
    }
    if (input.actionKey === 'archive') {
      toast.success(t('notification.toast.archived'));
      return;
    }
    toast.success(t('notification.toast.actionCompleted'));
  } catch {
    // useNotificationMutations owns translated error reporting.
  }
}

async function handleDelete(id: string) {
  await dismiss.mutateAsync(id);
  toast.success(t('notification.toast.deleted'));
}
</script>
