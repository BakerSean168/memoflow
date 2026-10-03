<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden" data-testid="notification-center">
    <!-- 与 Goal / Task 共用 ModuleHeader：筛选、计数、批量动作只占一层。 -->
    <ModuleHeader family="collection" data-testid="notification-page-toolbar">
      <template #leading>
        <ResponsiveSegmentedFilter
          :model-value="selectedFilter"
          :options="filterTabs"
          :accessible-label="t('notification.title')"
          test-id="notification-filter-control"
          expanded-option-test-id-prefix="notification-filter"
          collapse-mode="none"
          option-role="tab"
          @update:model-value="updateFilter"
        />
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
          class="divide-y divide-[hsl(var(--border-subtle))] border-y border-[hsl(var(--border-subtle))]"
          data-testid="notification-list-skeleton"
          role="status"
          :aria-label="t('notification.loading')"
        >
          <div v-for="i in 6" :key="i" class="flex min-h-14 items-start gap-3 px-1 py-3">
            <Skeleton class="h-8 w-8 shrink-0 rounded-lg" />
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

        <ProductSurfaceState
          v-else-if="isError"
          family="collection"
          kind="error"
          :title="t('notification.error.fetchFailed')"
          :description="t('notification.error.fetchFailedDescription')"
          test-id="notifications-error-state"
        >
          <template #icon><CircleAlert class="h-8 w-8" /></template>
          <template #actions>
            <Button
              variant="outline"
              size="sm"
              class="h-8"
              data-testid="notifications-retry"
              @click="refetch"
            >
              {{ t('notification.action.retry') }}
            </Button>
          </template>
        </ProductSurfaceState>

        <ProductSurfaceState
          v-else-if="filteredNotifications.length === 0 && selectedFilter === 'unread'"
          family="collection"
          kind="empty"
          :title="t('notification.allCaughtUp')"
          :description="t('notification.unreadEmptyDescription')"
          test-id="notifications-unread-empty"
        >
          <template #icon><CheckCheck class="h-8 w-8" /></template>
        </ProductSurfaceState>

        <ProductSurfaceState
          v-else-if="filteredNotifications.length === 0"
          family="collection"
          kind="empty"
          :title="t('notification.empty')"
          :description="t('notification.emptyDescription')"
          test-id="notifications-empty-state"
        >
          <template #icon><Bell class="h-8 w-8" /></template>
        </ProductSurfaceState>

        <div v-else data-testid="notifications-list">
          <NotificationList
            :notifications="filteredNotifications"
            :loading="false"
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
import { Bell, CheckCheck, CircleAlert } from '@lucide/vue';
import { Button, Skeleton } from '@memoflow/ui-vue-shadcn';
import ModuleHeader from '../../../components/shared/ModuleHeader.vue';
import { ProductSurfaceState, ResponsiveSegmentedFilter } from '../../../shared/components';
import NotificationList from '../components/NotificationList.vue';
import { useNotificationListQuery } from '../composables/useNotificationListQuery';
import { useNotificationUnreadQuery } from '../composables/useNotificationUnreadQuery';
import { useNotificationMutations } from '../composables/useNotificationMutations';
import { useNotificationStore } from '../stores/notification-store';
import type { NotificationClientDTO } from '@memoflow/contracts/notification';
import { resolveNotificationDestination } from '../notification-destination';

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
    countTestId: unreadCount.value > 0 ? 'notification-unread-badge' : undefined,
  },
]);

const filteredNotifications = computed(() => {
  if (selectedFilter.value === 'unread') return notifications.value.filter((n) => !n.isRead);
  return notifications.value;
});

function updateFilter(value: string): void {
  if (value !== 'all' && value !== 'unread') return;
  selectedFilter.value = value;
}

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
