<template>
  <ActionableWrapper
    :actions="menuActions"
    :show-more-button="true"
    wrapper-class="overflow-hidden"
    more-button-position="top-right"
    :more-button-label="t('notification.action.more')"
  >
    <button
      type="button"
      data-testid="notification-item"
      :data-notification-id="notification.id"
      :data-read-state="notification.isRead ? 'read' : 'unread'"
      :data-notification-type="notification.type"
      data-density="compact"
      :class="[
        'group relative flex w-full gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        notification.isRead
          ? 'bg-transparent text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--hover)/0.42)]'
          : 'bg-[hsl(var(--surface-raised)/0.38)] text-foreground hover:bg-[hsl(var(--hover)/0.62)]',
      ]"
      :aria-label="notification.title"
      @click="$emit('click', notification)"
    >
      <span
        v-if="!notification.isRead"
        class="absolute bottom-3 left-0 top-3 w-0.5 rounded-r-full bg-primary/60"
        aria-hidden="true"
      />

      <div
        :class="[
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.52)]',
          typeColorClass,
          notification.isRead ? 'opacity-55 saturate-50' : '',
        ]"
      >
        <component :is="typeIcon" class="h-4 w-4" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-start justify-between gap-4">
          <div class="flex min-w-0 items-center gap-2">
            <span
              :class="[
                'truncate text-[13px] transition-colors',
                notification.isRead
                  ? 'font-medium text-muted-foreground'
                  : 'font-semibold text-foreground',
              ]"
            >
              {{ notification.title }}
            </span>
            <Badge
              v-if="
                notification.importance === ImportanceLevel.Vital ||
                notification.importance === ImportanceLevel.Important
              "
              :variant="priorityVariant"
              class="h-5 shrink-0 px-1.5 py-0 text-[10px]"
            >
              {{ priorityText }}
            </Badge>
          </div>

          <time
            class="shrink-0 pr-8 pt-0.5 text-[10.5px] tabular-nums text-[hsl(var(--foreground-subtle))]"
            :datetime="String(notification.createdAt)"
          >
            {{ timeDisplay }}
          </time>
        </div>

        <p
          :class="[
            'mt-1 line-clamp-2 text-[12px] leading-5 transition-colors',
            notification.isRead
              ? 'text-[hsl(var(--foreground-subtle))]'
              : 'text-[hsl(var(--foreground-muted))]',
          ]"
        >
          {{ notification.content }}
        </p>

        <div
          class="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/75"
        >
          <span
            class="rounded-md bg-[hsl(var(--selected)/0.7)] px-1.5 py-0.5 text-[hsl(var(--foreground-muted))]"
          >
            {{ presentation.categoryLabel }}
          </span>
          <span class="truncate">{{ presentation.workflowLabel }}</span>
          <span v-if="presentation.relatedEntityLabel">
            · {{ presentation.relatedEntityLabel }}
          </span>
          <span
            v-if="hasExternalDestination"
            class="inline-flex items-center gap-0.5 text-foreground/60"
          >
            · {{ t('notification.action.openRelated') }}
            <ArrowUpRight class="h-3 w-3" />
          </span>
        </div>
      </div>
    </button>

    <div
      v-if="quickActions.length > 0"
      class="flex flex-wrap items-center gap-1.5 px-4 pb-3 pl-16"
      data-testid="notification-quick-actions"
    >
      <Button
        v-for="action in quickActions"
        :key="action.actionKey"
        type="button"
        variant="outline"
        size="sm"
        class="h-7 rounded-md px-2.5 text-xs font-normal"
        :data-testid="`notification-action-${action.actionKey}`"
        @click.stop="
          emit('execute-action', {
            notificationId: notification.id,
            actionKey: action.actionKey,
          })
        "
      >
        {{ actionLabel(action) }}
      </Button>
    </div>
  </ActionableWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Badge, Button } from '@memoflow/ui-vue-shadcn';
import { formatProductRelative } from '../../../shared/utils/product-time';
import {
  Info,
  CheckCircle2,
  Target,
  BellRing,
  CalendarClock,
  Bell,
  Check,
  Trash2,
  ArrowUpRight,
  Archive,
} from '@lucide/vue';
import type {
  NotificationActionIntent,
  NotificationClientDTO,
} from '@memoflow/contracts/notification';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { ActionableWrapper, menuLabel } from '../../../components/shared';
import type { MenuAction } from '../../../components/shared';
import { presentNotification } from '../presentation/notification-presentation';
import { semanticToneSurfaceClass } from '../../../shared/constants/semantic-tone';
import { hasNotificationExternalDestination } from '../desktop/notification-click-navigation';

interface Props {
  notification: NotificationClientDTO;
}

const props = defineProps<Props>();

const { t, te } = useI18n();
const presentation = computed(() => presentNotification(props.notification, t));
const hasExternalDestination = computed(() =>
  hasNotificationExternalDestination(props.notification),
);

const emit = defineEmits<{
  click: [notification: NotificationClientDTO];
  'mark-read': [id: string];
  'execute-action': [input: { notificationId: string; actionKey: string }];
  delete: [id: string];
}>();

const quickActions = computed(() =>
  (props.notification.actions ?? [])
    .filter(
      (action): action is Extract<NotificationActionIntent, { kind: 'owner-command' }> =>
        action.kind === 'owner-command',
    )
    .slice(0, 2),
);

const archiveAction = computed(() =>
  (props.notification.actions ?? []).find(
    (action): action is Extract<NotificationActionIntent, { kind: 'archive' }> =>
      action.kind === 'archive',
  ),
);

function actionLabel(action: NotificationActionIntent): string {
  if (te(action.labelKey)) return t(action.labelKey);
  if (action.actionKey === 'complete') return t('notification.action.complete');
  if (action.actionKey.startsWith('snooze')) return t('notification.action.snooze10m');
  if (action.kind === 'archive') return t('notification.action.archive');
  return action.actionKey;
}

const menuActions = computed<MenuAction[]>(() => {
  const actions: MenuAction[] = [];

  if (!props.notification.isRead) {
    actions.push({
      key: 'markRead',
      label: menuLabel('markRead'),
      icon: Check,
      handler: () => emit('mark-read', props.notification.id),
    });
  }

  if (archiveAction.value) {
    actions.push({
      key: archiveAction.value.actionKey,
      label: actionLabel(archiveAction.value),
      icon: Archive,
      separator: actions.length > 0,
      handler: () =>
        emit('execute-action', {
          notificationId: props.notification.id,
          actionKey: archiveAction.value!.actionKey,
        }),
    });
  }

  actions.push({
    key: 'delete',
    label: menuLabel('delete'),
    icon: Trash2,
    destructive: true,
    separator: actions.length > 0,
    handler: () => emit('delete', props.notification.id),
  });

  return actions;
});

const categoryIconMap: Record<ReturnType<typeof presentNotification>['categoryToken'], unknown> = {
  account: Info,
  general: Bell,
  goal: Target,
  reminder: BellRing,
  schedule: CalendarClock,
  system: Info,
  task: CheckCircle2,
};

const typeIcon = computed(() => categoryIconMap[presentation.value.categoryToken]);
const typeColorClass = computed(() => semanticToneSurfaceClass(presentation.value.tone));

const priorityVariant = computed(() => {
  switch (props.notification.importance) {
    case ImportanceLevel.Vital:
    case ImportanceLevel.Important:
      return 'destructive';
    case ImportanceLevel.Moderate:
      return 'secondary';
    default:
      return 'outline';
  }
});

const priorityText = computed(() => {
  switch (props.notification.importance) {
    case ImportanceLevel.Vital:
      return t('notification.item.priorityVital');
    case ImportanceLevel.Important:
      return t('notification.item.priorityImportant');
    default:
      return '';
  }
});

const timeDisplay = computed(() => {
  try {
    return formatProductRelative(props.notification.createdAt);
  } catch {
    return props.notification.createdAt;
  }
});
</script>
