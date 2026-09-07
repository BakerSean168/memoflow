<template>
  <div
    class="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    data-testid="reminder-linear-view"
  >
    <header
      class="z-10 flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b bg-background/80 px-2 py-2 backdrop-blur-sm @2xl/panel:px-4"
      data-testid="reminder-page-toolbar"
    >
      <div class="flex min-w-0 items-center gap-2">
        <component
          :is="selectedGroup ? Folder : LayoutGrid"
          class="h-4 w-4 shrink-0 text-primary"
        />
        <p
          data-testid="reminder-linear-heading"
          class="max-w-36 truncate text-sm font-medium @2xl/panel:max-w-52"
        >
          {{ currentViewLabel }}
        </p>
        <Badge variant="secondary" class="shrink-0 text-xs">{{ filteredTemplates.length }}</Badge>
      </div>

      <div
        class="relative order-last w-full basis-full @2xl/panel:order-none @2xl/panel:ml-auto @2xl/panel:w-44 @2xl/panel:basis-auto @5xl/panel:w-64"
      >
        <Search class="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          :placeholder="t('reminder.linear.searchPlaceholder')"
          class="h-8 w-full border-transparent bg-secondary/50 pl-8 focus-visible:border-ring focus-visible:bg-background"
          data-testid="reminder-search-input"
        />
      </div>

      <div class="ml-auto flex min-w-0 items-center gap-1 @2xl/panel:ml-0">
        <div
          class="flex items-center gap-2 rounded-full border bg-card px-2 py-1.5"
          data-testid="reminder-master-switch"
        >
          <span class="hidden text-xs text-muted-foreground @3xl/panel:inline">{{
            t('reminder.linear.masterSwitch')
          }}</span>
          <Switch
            :model-value="preferences?.globalReminderEnabled ?? true"
            :disabled="isSaving"
            :aria-label="t('reminder.linear.masterSwitch')"
            @update:model-value="handleToggleGlobalReminder"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8 shrink-0"
          :aria-label="t('reminder.action.createGroup')"
          :title="t('reminder.action.createGroup')"
          data-testid="create-reminder-group-button"
          @click="openCreateGroup()"
        >
          <FolderPlus class="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          class="h-8 shrink-0 px-2 @xl/panel:px-3"
          :aria-label="t('reminder.action.createReminder')"
          data-primary-action="create-reminder-template"
          data-testid="create-reminder-template-button"
          @click="handleCreateTemplate(selectedGroupId)"
        >
          <Plus class="h-4 w-4 @xl/panel:mr-1.5" />
          <span class="hidden @xl/panel:inline">{{ t('reminder.action.createReminder') }}</span>
        </Button>
      </div>
    </header>

    <div
      class="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] @3xl/panel:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)] @3xl/panel:grid-rows-1"
      data-testid="reminder-workspace-grid"
    >
      <nav
        class="min-w-0 overflow-auto border-b bg-sidebar @3xl/panel:border-b-0 @3xl/panel:border-r"
        :aria-label="t('reminder.linear.allReminders')"
        data-testid="reminder-group-sidebar"
      >
        <div class="flex min-w-max gap-1 p-2 @3xl/panel:min-w-0 @3xl/panel:flex-col">
          <button
            type="button"
            class="flex w-48 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors @3xl/panel:w-full"
            :class="!selectedGroupId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'"
            :aria-pressed="!selectedGroupId"
            data-testid="reminder-group-all"
            @click="selectedGroupId = null"
          >
            <LayoutGrid class="h-4 w-4 shrink-0" />
            <span class="truncate">{{ t('reminder.linear.allReminders') }}</span>
            <Badge variant="secondary" class="ml-auto text-xs">{{ templates.length }}</Badge>
          </button>

          <ActionableWrapper
            v-for="group in groups"
            :key="group.id"
            :actions="getProfileActions(group)"
            :show-more-button="false"
          >
            <button
              type="button"
              class="flex w-52 items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors @3xl/panel:w-full"
              :class="
                selectedGroupId === group.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
              "
              :aria-pressed="selectedGroupId === group.id"
              :data-testid="`reminder-group-${group.id}`"
              @click="selectedGroupId = group.id"
            >
              <Folder class="mt-0.5 h-4 w-4 shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2">
                  <span class="truncate">{{ group.name }}</span>
                  <Badge variant="outline" class="ml-auto shrink-0 text-[10px]">
                    {{ group.stats.totalTemplates }}
                  </Badge>
                </span>
                <span class="mt-1 line-clamp-2 text-[11px] text-muted-foreground/90">
                  {{ getSidebarProfileSummary(group) }}
                </span>
              </span>
            </button>
          </ActionableWrapper>
        </div>
      </nav>

      <main class="flex min-h-0 min-w-0 flex-col overflow-hidden" data-testid="reminder-content">
        <div
          class="min-h-0 flex-1 overflow-y-auto p-3 @2xl/panel:p-6"
          data-testid="reminder-scroll-host"
          data-scroll-host="reminder"
        >
          <div class="mx-auto max-w-5xl">
            <section
              class="mb-4 rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-background px-4 py-4"
              data-testid="routine-configuration-summary"
            >
              <div
                class="flex flex-col gap-3 @2xl/panel:flex-row @2xl/panel:items-start @2xl/panel:justify-between"
              >
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <Sparkles class="h-4 w-4 text-primary" />
                    <h1 class="text-sm font-semibold">
                      {{ t('reminder.linear.configurationTitle') }}
                    </h1>
                  </div>
                  <p class="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                    {{ t('reminder.linear.configurationDescription') }}
                  </p>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center text-xs @2xl/panel:min-w-64">
                  <div class="rounded-xl border bg-card px-2 py-2">
                    <p class="font-semibold text-foreground">{{ templates.length }}</p>
                    <p class="text-muted-foreground">{{ t('reminder.linear.routinesStat') }}</p>
                  </div>
                  <div class="rounded-xl border bg-card px-2 py-2">
                    <p class="font-semibold text-foreground">{{ runningRoutineCount }}</p>
                    <p class="text-muted-foreground">{{ t('reminder.linear.runningStat') }}</p>
                  </div>
                  <div class="rounded-xl border bg-card px-2 py-2">
                    <p class="font-semibold text-foreground">{{ groups.length }}</p>
                    <p class="text-muted-foreground">{{ t('reminder.linear.profilesStat') }}</p>
                  </div>
                </div>
              </div>
            </section>

            <div
              v-if="preferences && !preferences.globalReminderEnabled"
              class="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-medium">{{ t('reminder.linear.globalPausedTitle') }}</p>
                  <p class="mt-1 text-xs text-amber-800">
                    {{ preferences.summaryText || t('reminder.linear.globalPausedDescription') }}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  class="border-amber-300 bg-transparent text-amber-900 hover:bg-amber-100"
                  :disabled="isSaving"
                  @click="handleToggleGlobalReminder(true)"
                >
                  {{ t('reminder.linear.reEnableGlobal') }}
                </Button>
              </div>
            </div>

            <div v-if="selectedGroup" class="mb-4 rounded-2xl border bg-card px-4 py-4 shadow-sm">
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-sm font-semibold text-foreground">{{ selectedGroup.name }}</h2>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Badge variant="outline" class="cursor-help">
                        <ShieldCheck class="mr-1 h-3 w-3" />
                        {{ getProfileGateLabel(t, selectedGroup) }}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent class="max-w-xs text-xs leading-5">
                      {{ getProfilePolicyText(t, selectedGroup) }}
                    </TooltipContent>
                  </Tooltip>
                  <Badge :variant="isProfileGateOpen(selectedGroup) ? 'default' : 'secondary'">
                    {{
                      isProfileGateOpen(selectedGroup)
                        ? t('reminder.linear.profileActive')
                        : t('reminder.linear.profilePaused')
                    }}
                  </Badge>
                </div>
                <p class="text-xs leading-5 text-muted-foreground">
                  {{ selectedGroup.description || t('reminder.linear.profileFallbackDescription') }}
                </p>
                <p class="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  {{ getProfilePolicyText(t, selectedGroup) }}
                </p>
                <!-- 统计压成一行内联数字（§8-5） -->
                <p class="text-xs text-muted-foreground">
                  {{ getGroupTemplateCountLabel(t, selectedGroup) }} ·
                  {{ getGroupActiveStatusLabel(t, selectedGroup) }}
                </p>
              </div>
            </div>

            <div
              v-if="isLoading"
              class="flex h-[50vh] items-center justify-center text-muted-foreground"
            >
              {{ t('reminder.status.loading') }}
            </div>

            <div
              v-else-if="error"
              class="flex h-[50vh] flex-col items-center justify-center text-center"
              data-testid="routine-configuration-error"
            >
              <div
                class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
              >
                <CircleAlert class="h-6 w-6" />
              </div>
              <h3 class="mb-1 text-lg font-medium text-foreground">
                {{ t('reminder.error.configurationLoadFailed') }}
              </h3>
              <p class="max-w-md text-sm text-muted-foreground">{{ error }}</p>
              <Button class="mt-4" size="sm" variant="outline" @click="reloadReminderScene">
                <RefreshCw class="mr-2 h-4 w-4" />
                {{ t('reminder.action.retry') }}
              </Button>
            </div>

            <div
              v-else-if="filteredTemplates.length === 0"
              class="flex h-[50vh] flex-col items-center justify-center text-muted-foreground"
            >
              <div
                class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary"
              >
                <BellRing class="h-6 w-6 opacity-50" />
              </div>
              <h3 class="mb-1 text-lg font-medium text-foreground">{{ t('reminder.empty') }}</h3>
              <p class="text-sm">{{ t('reminder.emptyDescription') }}</p>
            </div>

            <div
              v-else
              class="grid grid-cols-1 gap-3 @xl/panel:grid-cols-2 @3xl/panel:grid-cols-3 @5xl/panel:grid-cols-4"
            >
              <GridTemplateItem
                v-for="tpl in filteredTemplates"
                :key="tpl.id"
                :item="tpl"
                @click="handleTemplateClick"
                @edit="handleEditTemplate"
                @delete="handleDeleteTemplate"
                @toggle-enabled="handleToggleEnabled"
                @move="handleMoveTemplate"
              />
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Template Detail Card -->
    <ReminderTemplateCard
      ref="templateCardRef"
      :template="selectedTemplate"
      @edit-template="handleEditTemplate"
      @status-changed="handleStatusChanged"
    />

    <!-- Dialogs -->
    <TemplateDialog
      ref="templateDialogRef"
      :template="editingTemplate"
      :group-options="groups"
      :default-group-id="defaultTemplateGroupId"
      :saving="isSaving"
      @save="handleSaveTemplate"
      @update="handleUpdateTemplate"
      @open-change="templateDialogOpen = $event"
    />

    <GroupDialog
      ref="groupDialogRef"
      :group="editingGroup"
      :saving="isSaving"
      @save="handleSaveGroup"
      @update="handleUpdateGroup"
      @open-change="groupDialogOpen = $event"
    />

    <TemplateMoveDialog
      ref="templateMoveDialogRef"
      :template="movingTemplate"
      :groups="groups"
      :templates="templates"
      :on-move="handleTemplateMoved"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import {
  BellRing,
  LayoutGrid,
  Folder,
  FolderPlus,
  Plus,
  Search,
  Pencil,
  Trash2,
  Power,
  Sparkles,
  ShieldCheck,
  CircleAlert,
  RefreshCw,
} from '@lucide/vue';
import {
  Badge,
  Button,
  Input,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useConfirm,
} from '@memoflow/ui-vue-shadcn';
import { ActionableWrapper } from '../../../components/shared';
import type { MenuAction } from '../../../components/shared';
import GridTemplateItem from '../components/GridTemplateItem.vue';
import ReminderTemplateCard from '../components/ReminderTemplateCard.vue';
import TemplateDialog from '../components/TemplateDialog.vue';
import GroupDialog from '../components/GroupDialog.vue';
import TemplateMoveDialog from '../components/TemplateMoveDialog.vue';
import { useReminder } from '../composables/useReminder';
import { usePanelSurfaceStatus } from '../../../layouts/shell/usePanelSurfaceStatus';
import type { PanelSurfaceStatus } from '../../../layouts/shell/useAppShellStore';
import {
  getGroupActiveStatusLabel,
  getProfileGateLabel,
  getProfilePolicyText,
  getProfileSidebarSummary,
  getGroupTemplateCountLabel,
  isProfileGateOpen,
} from '../presentation/lifecycle-presentation';
import type {
  CreateReminderGroupReq,
  CreateReminderTemplateReq,
  ReminderGroupClientDTO,
  ReminderTemplateClientDTO,
  UpdateReminderGroupReq,
  UpdateReminderTemplateReq,
} from '@memoflow/contracts/reminder';

const {
  templates,
  groups,
  isLoading,
  isSaving,
  error,
  preferences,
  fetchTemplates,
  fetchGroups,
  fetchPreferences,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  toggleTemplate,
  replaceTemplateProfiles,
  createGroup,
  updateGroup,
  deleteGroup,
  toggleGroup,
  updatePreferences,
  reloadReminderScene,
} = useReminder();

const { t } = useI18n();

const selectedGroupId = ref<string | null>(null);
const searchQuery = ref('');
const selectedTemplateId = ref<string | null>(null);
const selectedTemplate = computed(
  () => templates.value.find((template) => template.id === selectedTemplateId.value) ?? null,
);
const editingTemplate = ref<ReminderTemplateClientDTO | null>(null);
const defaultTemplateGroupId = ref<string | null>(null);
const templateCardRef = ref<InstanceType<typeof ReminderTemplateCard> | null>(null);
const templateDialogRef = ref<InstanceType<typeof TemplateDialog> | null>(null);
const templateMoveDialogRef = ref<InstanceType<typeof TemplateMoveDialog> | null>(null);
const groupDialogRef = ref<InstanceType<typeof GroupDialog> | null>(null);
const editingGroup = ref<ReminderGroupClientDTO | null>(null);
const movingTemplate = ref<ReminderTemplateClientDTO | null>(null);

// Phase 0 / UI-004：模板/分组编辑弹窗打开即视为未完成操作——统一离开协议
// （设置场景守卫 / Tab 切换 / 关面板）要求确认，取消不改变路由或草稿。
const templateDialogOpen = ref(false);
const groupDialogOpen = ref(false);
const surfaceStatus = computed<PanelSurfaceStatus>(() =>
  templateDialogOpen.value || groupDialogOpen.value ? 'dirty' : 'clean',
);
usePanelSurfaceStatus(surfaceStatus);

const filteredTemplates = computed(() => {
  let result = templates.value;
  if (selectedGroupId.value) {
    result = result.filter((t) =>
      t.profileMemberships.some((membership) => membership.profileId === selectedGroupId.value),
    );
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    result = result.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q),
    );
  }
  return result;
});

const selectedGroup = computed(
  () => groups.value.find((group) => group.id === selectedGroupId.value) || null,
);
const currentViewLabel = computed(
  () => selectedGroup.value?.name ?? t('reminder.linear.allReminders'),
);
const runningRoutineCount = computed(
  () => templates.value.filter((routine) => routine.effectiveEnabled).length,
);

function getSidebarProfileSummary(group: ReminderGroupClientDTO) {
  return getProfileSidebarSummary(t, group, templates.value);
}

function handleTemplateClick(template: ReminderTemplateClientDTO) {
  selectedTemplateId.value = template.id;
  templateCardRef.value?.open();
}

function handleCreateTemplate(groupId?: string | null) {
  editingTemplate.value = null;
  defaultTemplateGroupId.value = groupId ?? selectedGroupId.value ?? null;
  templateDialogRef.value?.openForCreate();
}

function handleEditTemplate(template: ReminderTemplateClientDTO) {
  editingTemplate.value = template;
  defaultTemplateGroupId.value = null;
  templateDialogRef.value?.openForEdit(template);
}

async function handleDeleteTemplate(template: ReminderTemplateClientDTO) {
  const confirmed = await useConfirm({
    title: t('reminder.template.confirmDeleteTitle'),
    description: t('reminder.template.confirmDelete', { name: template.name }),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  const ok = await deleteTemplate(template.id);
  if (ok) toast.success(t('reminder.toast.templateDeleted'));
}

async function handleToggleEnabled(template: ReminderTemplateClientDTO) {
  const result = await toggleTemplate(template.id);
  if (result) {
    toast.success(
      result.effectiveEnabled
        ? t('reminder.toast.templateEnabled')
        : t('reminder.toast.templatePaused'),
    );
  }
}

async function handleStatusChanged(template: ReminderTemplateClientDTO, _enabled: boolean) {
  await handleToggleEnabled(template);
}

function handleMoveTemplate(template: ReminderTemplateClientDTO) {
  movingTemplate.value = template;
  templateMoveDialogRef.value?.open();
}

async function handleTemplateMoved(templateId: string, profileIds: readonly string[]) {
  const result = await replaceTemplateProfiles(templateId, profileIds);
  if (result) {
    toast.success(
      profileIds.length > 0
        ? t('reminder.toast.templateMoved')
        : t('reminder.toast.templateMovedToRoot'),
    );
    movingTemplate.value = null;
  }
  return Boolean(result);
}

async function handleToggleGlobalReminder(enabled: boolean) {
  const result = await updatePreferences({ globalReminderEnabled: enabled });
  if (result) {
    toast.success(
      enabled
        ? t('reminder.toast.globalReminderEnabled')
        : t('reminder.toast.globalReminderPaused'),
    );
  }
}

async function handleSaveTemplate(data: CreateReminderTemplateReq) {
  const result = await createTemplate(data);
  if (result) {
    defaultTemplateGroupId.value = null;
    toast.success(t('reminder.toast.templateCreated'));
    templateDialogRef.value?.close();
  }
}

async function handleUpdateTemplate(id: string, data: UpdateReminderTemplateReq) {
  const result = await updateTemplate(id, data);
  if (result) {
    defaultTemplateGroupId.value = null;
    toast.success(t('reminder.toast.templateUpdated'));
    templateDialogRef.value?.close();
  }
}

async function handleSaveGroup(data: CreateReminderGroupReq) {
  const result = await createGroup(data);
  if (result) {
    toast.success(t('reminder.toast.groupCreated'));
    groupDialogRef.value?.close();
  }
}

async function handleUpdateGroup(id: string, data: UpdateReminderGroupReq) {
  const result = await updateGroup(id, data);
  if (result) {
    toast.success(t('reminder.toast.groupUpdated'));
    groupDialogRef.value?.close();
  }
}

function getProfileActions(profile: ReminderGroupClientDTO): MenuAction[] {
  return [
    {
      key: 'toggleProfile',
      label: isProfileGateOpen(profile)
        ? t('reminder.action.pauseProfile')
        : t('reminder.action.activateProfile'),
      icon: Power,
      handler: async () => {
        const result = await toggleGroup(profile.id);
        if (result) {
          toast.success(
            isProfileGateOpen(result)
              ? t('reminder.toast.profileActivated')
              : t('reminder.toast.profilePaused'),
          );
        }
      },
    },
    {
      key: 'edit',
      label: t('reminder.action.editProfile'),
      icon: Pencil,
      handler: () => handleEditGroup(profile),
    },
    {
      key: 'delete',
      label: t('reminder.action.deleteProfile'),
      icon: Trash2,
      destructive: true,
      separator: true,
      handler: () => handleDeleteGroup(profile),
    },
  ];
}

function handleEditGroup(group: ReminderGroupClientDTO) {
  editingGroup.value = group;
  groupDialogRef.value?.openForEdit(group);
}

async function handleDeleteGroup(group: ReminderGroupClientDTO) {
  const confirmed = await useConfirm({
    title: t('reminder.group.confirmDeleteTitle'),
    description: t('reminder.group.confirmDelete', { name: group.name }),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  const ok = await deleteGroup(group.id);
  if (ok) {
    if (selectedGroupId.value === group.id) selectedGroupId.value = null;
    toast.success(t('reminder.toast.groupDeleted'));
  }
}

function openCreateGroup() {
  editingGroup.value = null;
  groupDialogRef.value?.open();
}

onMounted(async () => {
  await Promise.all([fetchTemplates(), fetchGroups(), fetchPreferences()]);
});
</script>
