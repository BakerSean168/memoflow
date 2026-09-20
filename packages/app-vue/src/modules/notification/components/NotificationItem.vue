<template>
  <ActionableWrapper :actions="menuActions" :show-more-button="false">
    <button
      type="button"
      data-testid="notification-item"
      :data-notification-id="notification.id"
      :data-read-state="notification.isRead ? 'read' : 'unread'"
      :data-notification-type="notification.type"
      data-density="compact"
      :class="[
        'group flex w-full gap-3 border-b px-3 py-3 text-left transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        notification.isRead
          ? 'bg-background text-muted-foreground hover:bg-muted/30'
          : 'bg-muted/20 text-foreground hover:bg-muted/35',
      ]"
      :aria-label="notification.title"
      @click="$emit('click', notification)"
    >
      <!-- Icon -->
      <div
        :class="[
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
          typeColorClass,
          notification.isRead ? 'opacity-60' : '',
        ]"
      >
        <component :is="typeIcon" class="h-4 w-4" />
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <!-- Unread indicator dot -->
          <span v-if="!notification.isRead" class="h-1.5 w-1.5 shrink-0 rounded-full bg-info" />
          <span
            :class="[
              'text-sm transition-colors',
              notification.isRead ? 'text-muted-foreground' : 'font-semibold text-foreground',
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
            class="text-xs"
          >
            {{ priorityText }}
          </Badge>
        </div>

        <p
          :class="[
            'line-clamp-2 text-sm leading-5 transition-colors',
            notification.isRead ? 'text-muted-foreground/80' : 'text-foreground/80',
          ]"
        >
          {{ notification.content }}
        </p>

        <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" class="font-normal">{{ presentation.categoryLabel }}</Badge>
          <span class="truncate">{{ presentation.workflowLabel }}</span>
          <span v-if="presentation.relatedEntityLabel">
            · {{ presentation.relatedEntityLabel }}</span
          >
          <span v-if="hasExternalDestination" class="text-primary">
            · {{ t('notification.action.openRelated') }}
          </span>
        </div>

        <p
          :class="[
            'mt-1 text-xs transition-colors',
            notification.isRead ? 'text-muted-foreground/70' : 'font-medium text-info/90',
          ]"
        >
          {{ timeDisplay }}
        </p>
      </div>
    </button>
  </ActionableWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Badge } from '@memoflow/ui-vue-shadcn';
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
} from '@lucide/vue';
import type { NotificationClientDTO } from '@memoflow/contracts/notification';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { ActionableWrapper, menuLabel } from '../../../components/shared';
import type { MenuAction } from '../../../components/shared';
import { presentNotification } from '../presentation/notification-presentation';
import { hasNotificationExternalDestination } from '../desktop/notification-click-navigation';

interface Props {
  notification: NotificationClientDTO;
}

const props = defineProps<Props>();

const { t } = useI18n();
const presentation = computed(() => presentNotification(props.notification, t));
const hasExternalDestination = computed(() =>
  hasNotificationExternalDestination(props.notification),
);

const emit = defineEmits<{
  click: [notification: NotificationClientDTO];
  'mark-read': [id: string];
  delete: [id: string];
}>();

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

const typeIconMap: Record<string, unknown> = {
  SYSTEM: Info,
  TASK: CheckCircle2,
  GOAL: Target,
  REMINDER: BellRing,
  SCHEDULE: CalendarClock,
};

const typeColorClassMap: Record<string, string> = {
  SYSTEM: 'bg-info/10 text-info',
  TASK: 'bg-success/10 text-success',
  GOAL: 'bg-warning/10 text-warning',
  REMINDER: 'bg-purple-500/10 text-purple-500',
  SCHEDULE: 'bg-cyan-500/10 text-cyan-500',
};

const typeIcon = computed(() => typeIconMap[props.notification.type] || Bell);
const typeColorClass = computed(
  () => typeColorClassMap[props.notification.type] || 'bg-muted text-muted-foreground',
);

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
