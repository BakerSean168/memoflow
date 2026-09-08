<template>
  <Dialog :open="visible" @update:open="handleVisibleChange">
    <DialogContent
      data-testid="reminder-template-detail"
      class="flex max-h-[85vh] min-h-0 max-w-2xl flex-col overflow-hidden p-0"
    >
      <DialogHeader class="shrink-0 px-6 pt-6 pb-4">
        <div class="flex items-center gap-2">
          <component :is="getTemplateIcon()" class="h-6 w-6 text-primary" />
          <DialogTitle data-testid="reminder-template-detail-title">{{
            template?.name || t('reminder.templateDetail.fallbackTitle')
          }}</DialogTitle>
        </div>
        <DialogDescription class="text-sm text-muted-foreground">
          {{ t('reminder.templateDetail.description') }}
        </DialogDescription>
        <div class="flex items-center gap-2 mt-2">
          <Badge :variant="template?.effectiveEnabled ? 'default' : 'secondary'">
            {{ scheduleStateLabel }}
          </Badge>
          <Badge v-if="template?.profileMemberships.length" variant="outline">
            <Folder class="h-3 w-3 mr-1" />
            {{ profileMembershipLabel }}
          </Badge>
          <Badge v-if="template?.lifecycleSource === 'profile'" variant="outline">
            {{ t('reminder.templateDetail.badgeProfilePaused') }}
          </Badge>
          <Badge v-else-if="template?.lifecycleSource === 'global'" variant="secondary">{{
            t('reminder.templateDetail.badgeGlobalPaused')
          }}</Badge>
        </div>
      </DialogHeader>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
        <div v-if="template" class="space-y-6 py-2">
          <div class="space-y-3" data-testid="reminder-detail-schedule">
            <h3 class="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock class="h-4 w-4" />
              {{ t('reminder.schedule.trigger') }}
            </h3>
            <Separator />
            <div class="grid gap-3 @sm/panel:grid-cols-3">
              <Card class="p-3">
                <p class="text-xs text-muted-foreground">{{ t('reminder.schedule.trigger') }}</p>
                <p class="mt-1 font-semibold">{{ triggerLabel }}</p>
              </Card>
              <Card class="p-3">
                <p class="text-xs text-muted-foreground">
                  {{ t('reminder.schedule.nextTrigger') }}
                </p>
                <p class="mt-1 font-semibold">{{ nextTriggerLabel }}</p>
              </Card>
              <Card class="p-3">
                <p class="text-xs text-muted-foreground">{{ t('reminder.schedule.recurrence') }}</p>
                <p class="mt-1 font-semibold">{{ recurrenceLabel }}</p>
              </Card>
            </div>
          </div>

          <!-- Basic Info -->
          <div class="space-y-3">
            <h3 class="text-sm font-semibold flex items-center gap-2">
              <Info class="h-4 w-4" />
              {{ t('reminder.templateDetail.sectionBasicInfo') }}
            </h3>
            <Separator />

            <div class="space-y-3">
              <div class="flex items-start gap-3">
                <FileText class="h-5 w-5 text-muted-foreground mt-0.5" />
                <div class="flex-1">
                  <p class="text-sm font-medium">{{ t('reminder.templateDetail.fieldTitle') }}</p>
                  <p class="text-sm text-muted-foreground">{{ template.name }}</p>
                </div>
              </div>

              <div v-if="template.description" class="flex items-start gap-3">
                <AlignLeft class="h-5 w-5 text-muted-foreground mt-0.5" />
                <div class="flex-1">
                  <p class="text-sm font-medium">
                    {{ t('reminder.templateDetail.fieldDescription') }}
                  </p>
                  <p class="text-sm text-muted-foreground">{{ template.description }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Time Info -->
          <div class="space-y-3">
            <h3 class="text-sm font-semibold flex items-center gap-2">
              <Calendar class="h-4 w-4" />
              {{ t('reminder.templateDetail.sectionTimeInfo') }}
            </h3>
            <Separator />

            <div class="space-y-3">
              <div class="flex items-start gap-3">
                <CalendarPlus class="h-5 w-5 text-muted-foreground mt-0.5" />
                <div class="flex-1">
                  <p class="text-sm font-medium">
                    {{ t('reminder.templateDetail.fieldCreatedAt') }}
                  </p>
                  <p class="text-sm text-muted-foreground">
                    {{ formatProductDateTimeSeconds(template.createdAt, emptyUnknown(t)) }}
                  </p>
                </div>
              </div>

              <div class="flex items-start gap-3">
                <CalendarCheck class="h-5 w-5 text-muted-foreground mt-0.5" />
                <div class="flex-1">
                  <p class="text-sm font-medium">
                    {{ t('reminder.templateDetail.fieldUpdatedAt') }}
                  </p>
                  <p class="text-sm text-muted-foreground">
                    {{ formatProductDateTimeSeconds(template.updatedAt, emptyUnknown(t)) }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Status Toggle -->
          <div class="flex items-center justify-between rounded-lg border p-4">
            <div class="flex items-center gap-3">
              <Power
                :class="[
                  'h-5 w-5',
                  template.effectiveEnabled ? 'text-success' : 'text-muted-foreground',
                ]"
              />
              <div>
                <p class="text-sm font-medium">
                  {{ t('reminder.templateDetail.selfSwitchTitle') }}
                </p>
                <p class="text-xs text-muted-foreground">
                  {{ selfSwitchLabel }}
                </p>
                <p class="text-xs text-muted-foreground mt-1">
                  {{
                    t('reminder.templateDetail.effectiveStatusLine', {
                      status: effectiveStatusLabel,
                    })
                  }}
                </p>
              </div>
            </div>
            <Switch
              :model-value="template.selfEnabled"
              :aria-label="`${template.name}: ${t('reminder.templateDetail.selfSwitchTitle')}`"
              :disabled="isTogglingStatus"
              @update:model-value="handleToggleStatus"
            />
          </div>

          <div
            v-if="template.lifecycleSource !== 'routine'"
            class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <p class="font-medium">{{ t('reminder.templateDetail.overrideTitle') }}</p>
            <p class="mt-1 text-xs text-amber-800">
              {{
                t('reminder.templateDetail.overrideDescription', {
                  reason: template.effectiveEnabledReason,
                  controller:
                    template.lifecycleSource === 'global'
                      ? t('reminder.templateDetail.overrideControllerGlobal')
                      : t('reminder.templateDetail.overrideControllerProfile'),
                })
              }}
            </p>
          </div>

          <div class="space-y-3">
            <h3 class="text-sm font-semibold flex items-center gap-2">
              <Power class="h-4 w-4" />
              {{ t('reminder.templateDetail.sectionLifecycle') }}
            </h3>
            <Separator />

            <div class="grid grid-cols-2 gap-3 text-sm">
              <Card class="p-3">
                <p class="font-medium">{{ t('reminder.templateDetail.selfSwitchTitle') }}</p>
                <p class="text-muted-foreground mt-1">
                  {{ selfSwitchShortLabel }}
                </p>
              </Card>
              <Card class="p-3">
                <p class="font-medium">{{ t('reminder.templateDetail.fieldEffectiveResult') }}</p>
                <p class="text-muted-foreground mt-1">
                  {{ effectiveResultLabel }}
                </p>
              </Card>
              <Card class="p-3">
                <p class="font-medium">{{ t('reminder.templateDetail.fieldGlobalSwitch') }}</p>
                <p class="text-muted-foreground mt-1">
                  {{ globalSwitchLabel }}
                </p>
              </Card>
              <Card class="p-3">
                <p class="font-medium">{{ t('reminder.templateDetail.fieldProfile') }}</p>
                <p class="text-muted-foreground mt-1">
                  {{ profileMembershipLabel }}
                </p>
              </Card>
              <Card class="p-3">
                <p class="font-medium">{{ t('reminder.templateDetail.fieldProfileGate') }}</p>
                <p class="text-muted-foreground mt-1">
                  {{ profileGateStateLabel }}
                </p>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter class="shrink-0 border-t p-6 pt-4">
        <Button variant="default" @click="handleEdit">
          <Pencil class="h-4 w-4 mr-2" />
          {{ t('reminder.templateDetail.actionEdit') }}
        </Button>
        <Button variant="outline" @click="handleViewInstances">
          <Eye class="h-4 w-4 mr-2" />
          {{ t('reminder.templateDetail.actionViewInstances') }}
        </Button>
        <Button variant="ghost" @click="close">{{ t('common.close') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ReminderTemplateClientDTO } from '@memoflow/contracts/reminder';
import { emptyUnknown, formatProductDateTimeSeconds } from '../../../shared/utils/product-time';
import {
  Bell,
  Info,
  FileText,
  AlignLeft,
  Calendar,
  CalendarPlus,
  CalendarCheck,
  CalendarClock,
  Power,
  Pencil,
  Eye,
  Folder,
} from '@lucide/vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@memoflow/ui-vue-shadcn';
import { Badge } from '@memoflow/ui-vue-shadcn';
import { Button } from '@memoflow/ui-vue-shadcn';
import { Card } from '@memoflow/ui-vue-shadcn';
import { Switch } from '@memoflow/ui-vue-shadcn';
import { Separator } from '@memoflow/ui-vue-shadcn';
import {
  getGlobalSwitchLabel,
  getProfileGateStateLabel,
  getProfileMembershipLabel,
  getTemplateEffectiveResultLabel,
  getTemplateEffectiveStatusLabel,
  getTemplateNextTriggerLabel,
  getTemplateRecurrenceLabel,
  getTemplateScheduleStateLabel,
  getTemplateTriggerLabel,
  getTemplateSelfSwitchLabel,
  getTemplateSelfSwitchShortLabel,
} from '../presentation/lifecycle-presentation';

const props = defineProps<{
  template?: ReminderTemplateClientDTO | null;
}>();

const emit = defineEmits<{
  'edit-template': [template: ReminderTemplateClientDTO];
  'view-instances': [templateId: string];
  'status-changed': [template: ReminderTemplateClientDTO, enabled: boolean];
}>();

const { locale, t } = useI18n();
const visible = ref(false);
const isTogglingStatus = ref(false);

const selfSwitchLabel = computed(() => {
  if (!props.template) return t('common.unknown');
  return getTemplateSelfSwitchLabel(t, props.template);
});

const selfSwitchShortLabel = computed(() => {
  if (!props.template) return t('common.unknown');
  return getTemplateSelfSwitchShortLabel(t, props.template);
});

const effectiveStatusLabel = computed(() => {
  if (!props.template) return t('common.unknown');
  return getTemplateEffectiveStatusLabel(t, props.template);
});

const effectiveResultLabel = computed(() => {
  if (!props.template) return t('common.unknown');
  return getTemplateEffectiveResultLabel(t, props.template);
});

const triggerLabel = computed(() => {
  if (!props.template) return t('reminder.templateDetail.notConfigured');
  return getTemplateTriggerLabel(t, props.template);
});

const nextTriggerLabel = computed(() => {
  if (!props.template) return t('reminder.schedule.noNextTrigger');
  return getTemplateNextTriggerLabel(t, props.template, locale.value);
});

const recurrenceLabel = computed(() => {
  if (!props.template) return t('reminder.schedule.notConfigured');
  return getTemplateRecurrenceLabel(t, props.template);
});

const scheduleStateLabel = computed(() => {
  if (!props.template) return t('common.unknown');
  return getTemplateScheduleStateLabel(t, props.template);
});

const globalSwitchLabel = computed(() => {
  if (!props.template) return t('common.unknown');
  return getGlobalSwitchLabel(t, props.template);
});

const profileMembershipLabel = computed(() => {
  if (!props.template) return t('common.unknown');
  return getProfileMembershipLabel(t, props.template);
});

const profileGateStateLabel = computed(() => {
  if (!props.template) return t('common.unknown');
  return getProfileGateStateLabel(t, props.template);
});

const open = () => {
  visible.value = true;
};

const close = () => {
  visible.value = false;
};

const handleVisibleChange = (value: boolean) => {
  visible.value = value;
};

const handleToggleStatus = async (enabled: boolean) => {
  if (!props.template) return;

  isTogglingStatus.value = true;
  try {
    emit('status-changed', props.template, enabled);
  } finally {
    isTogglingStatus.value = false;
  }
};

const handleEdit = () => {
  if (props.template) {
    emit('edit-template', props.template);
    close();
  }
};

const handleViewInstances = () => {
  if (props.template) {
    emit('view-instances', props.template.id);
    close();
  }
};

const getTemplateIcon = () => {
  return Bell;
};

defineExpose({
  open,
  close,
});
</script>
