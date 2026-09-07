<template>
  <ActionableWrapper :actions="menuActions" :show-more-button="false" wrapper-class="rounded-xl">
    <button
      type="button"
      data-testid="reminder-template-card"
      :data-reminder-id="item.id"
      class="relative w-full cursor-pointer rounded-xl text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      :class="[
        'flex min-h-48 flex-col gap-3 p-4',
        isTemplateEnabled ? 'bg-card hover:bg-accent/50' : 'bg-muted/70',
      ]"
      draggable="true"
      :aria-label="item.name"
      @click="$emit('click', item)"
      @dragstart="onDragStart"
    >
      <div class="flex min-w-0 items-start justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2.5">
          <div
            :class="[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              isTemplateEnabled ? 'bg-primary/10' : 'bg-muted',
            ]"
          >
            <Bell
              :class="['h-4 w-4', isTemplateEnabled ? 'text-primary' : 'text-muted-foreground']"
            />
          </div>
          <p
            :class="[
              'line-clamp-2 min-w-0 text-sm font-semibold',
              isTemplateEnabled ? 'text-foreground' : 'text-muted-foreground',
            ]"
          >
            {{ item.name }}
          </p>
        </div>
        <span
          class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
          :class="scheduleStateClass"
          data-testid="reminder-schedule-state"
        >
          {{ scheduleStateLabel }}
        </span>
      </div>

      <div
        class="rounded-lg border bg-background/70 px-3 py-2.5"
        data-testid="reminder-trigger-summary"
      >
        <p class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {{ t('reminder.schedule.trigger') }}
        </p>
        <p class="mt-1 text-base font-semibold text-foreground">{{ triggerLabel }}</p>
      </div>

      <div class="space-y-2 text-xs">
        <div class="flex items-start gap-2">
          <CalendarClock class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div class="min-w-0">
            <p class="text-[10px] text-muted-foreground">
              {{ t('reminder.schedule.nextTrigger') }}
            </p>
            <p class="truncate font-medium" data-testid="reminder-next-trigger">
              {{ nextTriggerLabel }}
            </p>
          </div>
        </div>
        <div class="flex items-start gap-2">
          <Repeat2 class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div>
            <p class="text-[10px] text-muted-foreground">{{ t('reminder.schedule.recurrence') }}</p>
            <p class="font-medium" data-testid="reminder-recurrence">{{ recurrenceLabel }}</p>
          </div>
        </div>
      </div>

      <p
        class="mt-auto truncate border-t pt-2 text-[10px] text-muted-foreground"
        :title="item.effectiveEnabledReason"
        data-testid="reminder-control-source"
      >
        {{ secondaryLifecycleLabel }}
      </p>
    </button>
  </ActionableWrapper>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { Bell, CalendarClock, FolderInput, Pencil, Power, Repeat2, Trash2 } from '@lucide/vue';
import type { ReminderTemplateClientDTO } from '@memoflow/contracts/reminder';
import { ActionableWrapper, menuLabel } from '../../../components/shared';
import type { MenuAction } from '../../../components/shared';
import {
  getProfileMembershipLabel,
  getTemplateLifecycleSummary,
  getTemplateNextTriggerLabel,
  getTemplateRecurrenceLabel,
  getTemplateScheduleState,
  getTemplateScheduleStateLabel,
  getTemplateTriggerLabel,
} from '../presentation/lifecycle-presentation';

const props = defineProps<{
  item: ReminderTemplateClientDTO;
}>();

const emit = defineEmits<{
  click: [item: ReminderTemplateClientDTO];
  move: [item: ReminderTemplateClientDTO];
  edit: [item: ReminderTemplateClientDTO];
  delete: [item: ReminderTemplateClientDTO];
  'toggle-enabled': [item: ReminderTemplateClientDTO];
}>();

const { locale, t } = useI18n();
const isTemplateEnabled = computed(() => props.item.effectiveEnabled);
const lifecycleLabel = computed(() => getTemplateLifecycleSummary(t, props.item));
const triggerLabel = computed(() => getTemplateTriggerLabel(t, props.item));
const nextTriggerLabel = computed(() => getTemplateNextTriggerLabel(t, props.item, locale.value));
const recurrenceLabel = computed(() => getTemplateRecurrenceLabel(t, props.item));
const scheduleState = computed(() => getTemplateScheduleState(props.item));
const scheduleStateLabel = computed(() => getTemplateScheduleStateLabel(t, props.item));
const secondaryLifecycleLabel = computed(() => {
  const profileLabel = getProfileMembershipLabel(t, props.item);
  return props.item.profileMemberships.length > 0
    ? `${profileLabel} · ${lifecycleLabel.value}`
    : lifecycleLabel.value;
});
const scheduleStateClass = computed(() => {
  switch (scheduleState.value) {
    case 'upcoming':
      return 'bg-emerald-100 text-emerald-800';
    case 'missed':
      return 'bg-amber-100 text-amber-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    case 'paused':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-slate-100 text-slate-700';
  }
});

// Support both injected callbacks and emits for flexibility
const onMoveTemplate = inject<(item: ReminderTemplateClientDTO) => void>('onMoveTemplate', (item) =>
  emit('move', item),
);
const onEditTemplate = inject<(item: ReminderTemplateClientDTO) => void>('onEditTemplate', (item) =>
  emit('edit', item),
);
const onDeleteTemplate = inject<(item: ReminderTemplateClientDTO) => void>(
  'onDeleteTemplate',
  (item) => emit('delete', item),
);
const onToggleTemplate = inject<(item: ReminderTemplateClientDTO) => void>(
  'onToggleTemplate',
  (item) => emit('toggle-enabled', item),
);

const onDragStart = (event: DragEvent) => {
  event.dataTransfer?.setData('application/json', JSON.stringify(props.item));
};

const menuActions = computed<MenuAction[]>(() => [
  {
    key: 'toggle-enabled',
    testId: `reminder-template-toggle-action-${props.item.id}`,
    label: props.item.effectiveEnabled ? menuLabel('pauseTemplate') : menuLabel('enableTemplate'),
    icon: Power,
    handler: () => onToggleTemplate(props.item),
  },
  {
    key: 'move',
    testId: `reminder-template-move-action-${props.item.id}`,
    label: menuLabel('moveToGroup'),
    icon: FolderInput,
    handler: () => onMoveTemplate(props.item),
  },
  {
    key: 'edit',
    testId: `reminder-template-edit-action-${props.item.id}`,
    label: menuLabel('editTemplate'),
    icon: Pencil,
    handler: () => onEditTemplate(props.item),
  },
  {
    key: 'delete',
    testId: `reminder-template-delete-action-${props.item.id}`,
    label: menuLabel('deleteTemplate'),
    icon: Trash2,
    destructive: true,
    separator: true,
    handler: () => onDeleteTemplate(props.item),
  },
]);
</script>
