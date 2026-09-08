<template>
  <Dialog :open="visible" @update:open="handleVisibleChange">
    <DialogContent class="flex max-h-[85vh] min-h-0 max-w-md flex-col overflow-hidden p-0">
      <DialogHeader class="shrink-0 px-6 pt-6 pb-4">
        <div class="flex items-center gap-2">
          <FolderInput class="h-5 w-5 text-primary" />
          <DialogTitle>{{ t('reminder.templateMove.title') }}</DialogTitle>
        </div>
        <DialogDescription class="text-sm text-muted-foreground">
          {{ t('reminder.templateMove.description') }}
        </DialogDescription>
      </DialogHeader>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
        <div class="space-y-4 py-2">
          <Alert v-if="template">
            <Info class="h-4 w-4" />
            <AlertTitle>{{ t('reminder.templateMove.currentTemplate') }}</AlertTitle>
            <AlertDescription>
              <div class="mt-1 flex items-center gap-2">
                <Bell class="h-4 w-4" />
                <span class="font-medium">{{ template.name }}</span>
              </div>
              <div class="mt-1 flex items-center gap-2 text-xs">
                <Folder class="h-3 w-3" />
                <span>{{ t('reminder.templateMove.currentGroup') }} {{ currentProfileNames }}</span>
              </div>
            </AlertDescription>
          </Alert>

          <div class="space-y-2">
            <Label>{{ t('reminder.templateMove.targetGroup') }}</Label>
            <div v-if="groupOptions.length > 0" class="space-y-2 rounded-md border p-2">
              <label
                v-for="profile in groupOptions"
                :key="profile.id"
                class="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/50"
              >
                <Checkbox
                  :aria-label="profile.name"
                  :model-value="selectedProfileIds.includes(profile.id)"
                  @update:model-value="toggleProfile(profile.id, $event)"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <component :is="getGroupIcon(profile.icon)" class="h-4 w-4 shrink-0" />
                    <span class="truncate font-medium">{{ profile.name }}</span>
                    <Badge
                      v-if="currentProfileIds.includes(profile.id)"
                      variant="outline"
                      class="ml-auto"
                    >
                      {{ t('reminder.templateMove.current') }}
                    </Badge>
                  </div>
                  <div class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{{ getGroupStatus(profile.id) }}</span>
                    <span>·</span>
                    <span>{{ getGroupTemplateCount(profile.id) }} Routine</span>
                  </div>
                  <p class="mt-1 text-xs text-muted-foreground">
                    {{ getProfilePolicyText(profile.id) }}
                  </p>
                </div>
              </label>
            </div>
            <p v-else class="text-sm text-muted-foreground">
              {{ t('reminder.templateMove.none') }}
            </p>
          </div>

          <Alert v-if="selectedProfileIds.length === 0">
            <AlertCircle class="h-4 w-4" />
            <AlertTitle>{{ t('reminder.templateMove.warning') }}</AlertTitle>
            <AlertDescription>
              {{ t('reminder.templateMove.warningDescription') }}
            </AlertDescription>
          </Alert>

          <Alert>
            <Info class="h-4 w-4" />
            <AlertTitle>{{ t('reminder.templateMove.previewTitle') }}</AlertTitle>
            <AlertDescription>{{ previewText }}</AlertDescription>
          </Alert>
        </div>
      </div>

      <DialogFooter class="shrink-0 flex-row justify-end gap-2 border-t p-6 pt-4">
        <Button variant="ghost" :disabled="isMoving" @click="close">
          {{ t('reminder.templateMove.cancel') }}
        </Button>
        <Button variant="default" :disabled="!canMove || isMoving" @click="handleMove">
          <Loader2 v-if="isMoving" class="mr-2 h-4 w-4 animate-spin" />
          {{ t('reminder.templateMove.move') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  ReminderGroupClientDTO,
  ReminderTemplateClientDTO,
} from '@memoflow/contracts/reminder';
import { AlertCircle, Bell, Folder, FolderInput, FolderOpen, Info, Loader2 } from '@lucide/vue';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from '@memoflow/ui-vue-shadcn';
import {
  getProfilePolicyText as getProfilePolicySummary,
  isProfileGateOpen,
} from '../presentation/lifecycle-presentation';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    template?: ReminderTemplateClientDTO | null;
    groups?: ReminderGroupClientDTO[];
    templates?: ReminderTemplateClientDTO[];
    onMove?: (templateId: string, profileIds: readonly string[]) => Promise<boolean>;
  }>(),
  {
    template: null,
    groups: () => [],
    templates: () => [],
  },
);

const emit = defineEmits<{ closed: [] }>();
const visible = ref(false);
const selectedProfileIds = ref<string[]>([]);
const isMoving = ref(false);

const currentProfileIds = computed(
  () => props.template?.profileMemberships.map((membership) => String(membership.profileId)) ?? [],
);

const currentProfileNames = computed(() => {
  if (!props.template || props.template.profileMemberships.length === 0) {
    return t('reminder.templateMove.none');
  }
  return props.template.profileMemberships
    .map((membership) => membership.profileName ?? String(membership.profileId))
    .join(', ');
});

const groupOptions = computed(() =>
  props.groups.map((group) => ({
    id: group.id,
    name: group.name,
    icon: group.icon || 'mdi-folder',
  })),
);

const canMove = computed(() => {
  if (!props.template) return false;
  return normalizeIds(selectedProfileIds.value) !== normalizeIds(currentProfileIds.value);
});

const previewText = computed(() => {
  if (selectedProfileIds.value.length === 0) return t('reminder.templateMove.previewRoot');
  const selectedProfiles = props.groups.filter((group) =>
    selectedProfileIds.value.includes(group.id),
  );
  return selectedProfiles.some(isProfileGateOpen)
    ? t('reminder.templateMove.previewProfileEnabled')
    : t('reminder.templateMove.previewProfilePaused');
});

function normalizeIds(ids: readonly string[]): string {
  return [...ids].sort().join('\u0000');
}

function toggleProfile(profileId: string, value: boolean | 'indeterminate') {
  const selected = new Set(selectedProfileIds.value);
  if (value === true) selected.add(profileId);
  else selected.delete(profileId);
  selectedProfileIds.value = [...selected];
}

function getGroupStatus(profileId: string): string {
  const profile = props.groups.find((group) => group.id === profileId);
  return profile && isProfileGateOpen(profile)
    ? t('reminder.templateMove.enabled')
    : t('reminder.templateMove.disabled');
}

function getGroupTemplateCount(profileId: string): number {
  return props.templates.filter((template) =>
    template.profileMemberships.some((membership) => membership.profileId === profileId),
  ).length;
}

function getProfilePolicyText(profileId: string): string {
  const profile = props.groups.find((group) => group.id === profileId);
  return profile
    ? getProfilePolicySummary(t, profile)
    : t('reminder.templateMove.defaultPolicyText');
}

function getGroupIcon(icon?: string) {
  return icon === 'mdi-folder-open' ? FolderOpen : Folder;
}

function resetForm() {
  selectedProfileIds.value = [...currentProfileIds.value];
}

function open() {
  resetForm();
  visible.value = true;
}

function close() {
  visible.value = false;
  emit('closed');
  setTimeout(resetForm, 300);
}

function handleVisibleChange(value: boolean) {
  visible.value = value;
  if (!value) {
    emit('closed');
    setTimeout(resetForm, 300);
  }
}

async function handleMove() {
  if (!props.template || !canMove.value) return;
  isMoving.value = true;
  try {
    const moved = await props.onMove?.(props.template.id, [...selectedProfileIds.value]);
    if (moved) close();
  } finally {
    isMoving.value = false;
  }
}

watch(
  () => props.template,
  () => resetForm(),
  { immediate: true },
);

defineExpose({ open, close });
</script>
