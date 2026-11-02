<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, Clock3, ChevronDown } from '@lucide/vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@memoflow/ui-vue-shadcn';
import type {
  NotificationActionIntent,
  NotificationClientDTO,
  ExecuteNotificationActionReq,
} from '@memoflow/notification-contracts';
const props = withDefaults(
  defineProps<{
    notification: NotificationClientDTO;
    testIdPrefix?: string;
    actionsTestId?: string;
  }>(),
  {
    testIdPrefix: 'notification-action',
    actionsTestId: 'notification-quick-actions',
  },
);
const emit = defineEmits<{ 'execute-action': [input: ExecuteNotificationActionReq] }>();
const { t, te } = useI18n();
const quickActions = computed(() =>
  (props.notification.actions ?? [])
    .filter(
      (action): action is Extract<NotificationActionIntent, { kind: 'owner-command' }> =>
        action.kind === 'owner-command',
    )
    .slice(0, 2),
);

const snoozeAction = computed(() =>
  quickActions.value.find((action) => action.commandKey === 'routine.snooze'),
);
const customSnoozeOpen = ref(false);
const customMinutes = ref(10);
const snoozeOptions = [
  { minutes: 60, label: 'notification.action.snooze1h' },
  { minutes: 180, label: 'notification.action.snooze3h' },
  { minutes: 1440, label: 'notification.action.snoozeTomorrow' },
  { minutes: 10080, label: 'notification.action.snoozeNextWeek' },
];
function snooze(minutes: number) {
  if (!snoozeAction.value || !Number.isInteger(minutes) || minutes < 1 || minutes > 525600) return;
  emit('execute-action', {
    notificationId: props.notification.id,
    actionKey: snoozeAction.value.actionKey,
    snoozeDurationMs: minutes * 60_000,
  });
}

function actionLabel(action: NotificationActionIntent): string {
  if (te(action.labelKey)) return t(action.labelKey);
  if (action.actionKey === 'complete') return t('notification.action.complete');
  if (action.actionKey.startsWith('snooze')) return t('notification.action.snooze10m');
  if (action.kind === 'archive') return t('notification.action.archive');
  return action.actionKey;
}
</script>
<template>
  <div
    v-if="quickActions.length > 0"
    class="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1"
    :data-testid="actionsTestId"
  >
    <Button
      v-for="action in quickActions"
      :key="action.actionKey"
      type="button"
      variant="outline"
      size="sm"
      class="relative h-8 w-8 rounded-md p-0"
      :aria-label="actionLabel(action)"
      :title="actionLabel(action)"
      :data-testid="`${testIdPrefix}-${action.actionKey}`"
      @click.stop="
        emit('execute-action', {
          notificationId: notification.id,
          actionKey: action.actionKey,
        })
      "
    >
      <Check v-if="action.actionKey === 'complete'" class="h-4 w-4" aria-hidden="true" />
      <template v-else-if="action.actionKey.startsWith('snooze')">
        <Clock3 class="h-4 w-4" aria-hidden="true" />
        <span
          class="absolute bottom-0 right-0 rounded bg-background px-0.5 text-[8px] leading-3 after:content-['10']"
          aria-hidden="true"
          data-testid="notification-snooze-badge"
        />
      </template>
      <span
        :class="
          action.actionKey === 'complete' || action.actionKey.startsWith('snooze') ? 'sr-only' : ''
        "
        >{{ actionLabel(action) }}</span
      >
    </Button>
    <DropdownMenu v-if="snoozeAction" :modal="false">
      <DropdownMenuTrigger as-child>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          :aria-label="t('notification.action.snoozeMore')"
          :title="t('notification.action.snoozeMore')"
        >
          <ChevronDown class="h-3 w-3" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          v-for="option in snoozeOptions"
          :key="option.minutes"
          :data-testid="`notification-snooze-${option.minutes}`"
          @select="snooze(option.minutes)"
        >
          {{ t(option.label) }}
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="notification-snooze-custom"
          @select="customSnoozeOpen = true"
        >
          {{ t('notification.action.snoozeCustom') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
  <Dialog v-model:open="customSnoozeOpen"
    ><DialogContent
      ><DialogHeader
        ><DialogTitle>{{ t('notification.action.snoozeCustom') }}</DialogTitle></DialogHeader
      >
      <div class="flex items-center gap-2">
        <input
          v-model.number="customMinutes"
          type="number"
          min="1"
          max="525600"
          class="w-24 rounded border bg-background px-2 py-1 text-xs"
          :aria-label="t('notification.action.snoozeMinutes')"
        />
        <Button
          size="sm"
          :disabled="
            !Number.isInteger(customMinutes) || customMinutes < 1 || customMinutes > 525600
          "
          data-testid="notification-snooze-apply"
          @click="
            snooze(customMinutes);
            customSnoozeOpen = false;
          "
        >
          {{ t('notification.action.snoozeApply') }}
        </Button>
      </div></DialogContent
    ></Dialog
  >
</template>
