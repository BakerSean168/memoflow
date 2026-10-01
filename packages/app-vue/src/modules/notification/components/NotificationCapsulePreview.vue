<template>
  <div
    class="flex max-h-[30rem] min-h-0 flex-col"
    data-testid="notification-capsule-preview"
    data-capsule-workspace="notification"
  >
    <div
      class="mb-2 flex items-center justify-between gap-2 border-b border-[hsl(var(--border-subtle))] pb-1.5"
    >
      <div class="flex items-center gap-2">
        <p class="text-xs font-semibold">{{ t('notification.drawer.title') }}</p>
        <span
          v-if="unreadCount > 0"
          class="rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-primary"
          data-testid="notification-capsule-unread-count"
        >
          {{ unreadCount }}
        </span>
      </div>
      <Button
        v-if="hasUnread"
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 px-2 text-[11px]"
        data-testid="notification-capsule-mark-all-read"
        :disabled="isMarkingAll"
        @click="handleMarkAllRead"
      >
        {{ t('notification.action.markAllRead') }}
      </Button>
    </div>

    <div v-if="isLoading && recentItems.length === 0" class="space-y-2 py-2">
      <div v-for="i in 3" :key="i" class="space-y-1">
        <div class="h-3 w-3/4 rounded bg-muted animate-pulse" />
        <div class="h-2.5 w-1/2 rounded bg-muted animate-pulse" />
      </div>
    </div>

    <div
      v-else-if="recentItems.length === 0"
      class="py-4 text-center text-[11px] text-muted-foreground"
      data-testid="notification-capsule-empty"
    >
      {{ t('notification.empty') }}
    </div>

    <ul
      v-else
      class="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5"
      data-testid="notification-capsule-list"
    >
      <li
        v-for="item in recentItems"
        :key="item.id"
        class="rounded-lg"
        :data-testid="`notification-capsule-item-${item.id}`"
        :data-read-state="item.isRead ? 'read' : 'unread'"
      >
        <button
          type="button"
          class="flex w-full items-start gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[hsl(var(--hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="item.title"
          @click="handleItemClick(item)"
        >
          <span
            v-if="!item.isRead"
            class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1" :class="item.isRead ? 'pl-3' : ''">
            <div class="flex min-w-0 items-start justify-between gap-2">
              <p
                class="min-w-0 flex-1 truncate text-[11px] leading-4"
                :class="item.isRead ? 'text-muted-foreground' : 'font-semibold text-foreground'"
              >
                {{ item.title }}
              </p>
              <span class="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground/70">
                {{ formatProductRelative(item.createdAt) }}
              </span>
            </div>
            <p class="mt-0.5 line-clamp-2 text-[10px] leading-3.5 text-muted-foreground">
              {{ item.content }}
            </p>
          </div>
        </button>

        <div
          v-if="ownerActions(item).length > 0"
          class="flex flex-wrap items-center gap-1 px-2 pb-1.5 pl-5"
          :data-testid="`notification-capsule-actions-${item.id}`"
        >
          <Button
            v-for="action in ownerActions(item)"
            :key="action.actionKey"
            type="button"
            variant="ghost"
            size="sm"
            class="h-6 rounded-md px-2 text-[10px] font-normal text-muted-foreground hover:text-foreground"
            :data-testid="`notification-capsule-action-${item.id}-${action.actionKey}`"
            @click.stop="handleExecuteAction(item, action.actionKey)"
          >
            {{ actionLabel(action) }}
          </Button>
        </div>
      </li>
    </ul>

    <div class="flex shrink-0 justify-end border-t border-[hsl(var(--border-subtle))] pt-2">
      <button
        type="button"
        class="flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--hover))] hover:text-foreground"
        data-testid="notification-capsule-view-all"
        @click="$emit('view-all')"
      >
        {{ t('notification.drawer.viewAll') }}
        <ArrowRight class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * NotificationCapsulePreview — 通知胶囊预览浮层（UI 重构 V2 §6.5 / §2.2）
 *
 * 承接 V1 铃铛弹层职责：最近 N 条 + 全部已读 + 查看全部（进入完整信箱面板）。
 * 数据走 Query Cache（pilot）：capsule 使用自己的 canonical list key（page 1 + 不同 limit），
 * 不再覆盖共享 list；unread 与 Shell/页面共享同一 key。组件不做 imperative mount refresh，
 * mutation 成功后由 invalidation 收敛。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { ArrowRight } from '@lucide/vue';
import { Button } from '@memoflow/ui-vue-shadcn';
import { formatProductRelative } from '../../../shared/utils/product-time';
import { resolveNotificationDestination } from '../notification-destination';
import { useNotificationListQuery } from '../composables/useNotificationListQuery';
import { useNotificationUnreadQuery } from '../composables/useNotificationUnreadQuery';
import { useNotificationMutations } from '../composables/useNotificationMutations';
import type {
  NotificationActionIntent,
  NotificationClientDTO,
} from '@memoflow/contracts/notification';

const RECENT_LIMIT = 5;

const emit = defineEmits<{
  'view-all': [];
  navigate: [destination: { path: string; query?: Record<string, string> }];
}>();

const { t, te } = useI18n();
const { notifications, isLoading } = useNotificationListQuery({
  page: 1,
  limit: RECENT_LIMIT * 2,
});
const { hasUnread, unreadCount } = useNotificationUnreadQuery();
const { markAsRead, markAllAsRead, executeAction } = useNotificationMutations();

const isMarkingAll = computed(() => markAllAsRead.isPending.value);

const recentItems = computed(() => {
  // 未读优先，其次按创建时间倒序；预览只展示最近 N 条
  const sorted = [...notifications.value].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0);
  });
  return sorted.slice(0, RECENT_LIMIT);
});

async function handleMarkAllRead() {
  if (!hasUnread.value || isMarkingAll.value) return;
  await markAllAsRead.mutateAsync();
  toast.success(t('notification.toast.allMarkedRead'));
}

type OwnerCommandAction = Extract<NotificationActionIntent, { kind: 'owner-command' }>;

function ownerActions(item: NotificationClientDTO): OwnerCommandAction[] {
  return (item.actions ?? [])
    .filter(
      (action): action is OwnerCommandAction =>
        action.kind === 'owner-command' &&
        (action.actionKey === 'complete' || action.actionKey.startsWith('snooze')),
    )
    .slice(0, 2);
}

function actionLabel(action: OwnerCommandAction): string {
  if (te(action.labelKey)) return t(action.labelKey);
  if (action.actionKey === 'complete') return t('notification.action.complete');
  if (action.actionKey.startsWith('snooze')) return t('notification.action.snooze10m');
  return action.actionKey;
}

async function handleExecuteAction(item: NotificationClientDTO, actionKey: string) {
  try {
    const result = await executeAction.mutateAsync({
      notificationId: item.id,
      actionKey,
    });
    if (result.interaction.outcome !== 'accepted') {
      toast.error(t('notification.toast.actionRejected'));
      return;
    }
    if (actionKey === 'complete') {
      toast.success(t('notification.toast.routineCompleted'));
      return;
    }
    if (actionKey.startsWith('snooze')) {
      toast.success(t('notification.toast.routineSnoozed'));
    }
  } catch {
    // useNotificationMutations owns translated error reporting.
  }
}

async function handleItemClick(item: NotificationClientDTO) {
  if (!item.isRead) {
    await markAsRead.mutateAsync(item.id);
  }

  const destination = resolveNotificationDestination(item);
  if (destination.path !== '/notifications') {
    emit('navigate', destination);
  }
}
</script>
