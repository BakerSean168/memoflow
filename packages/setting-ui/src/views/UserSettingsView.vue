<script setup lang="ts">
/**
 * UserSettingsView — Settings Hub composition root.
 *
 * The root owns navigation/layout only. Each section owns its own capability client,
 * loading/error/mutation state. `settings-tab-{value}` remains the stable E2E contract.
 *
 * The shell dialog always owns the surface: the initial section comes from the
 * `initialTab` prop (mapped from the settings deep link by the shell), the URL is
 * never read or written here, and the close action emits `close`.
 *
 * Issue #927: the shell is a two-column T3-style surface — section navigation with a
 * name filter on the left, breadcrumb + section restore + close on the right. Closing
 * (this X, the dialog's Esc, or its backdrop) emits `close`, which the shell routes
 * into `returnFromSettingsScene` so the pre-settings tab/surface/layout is restored.
 */
import {
  computed,
  defineAsyncComponent,
  inject,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { PanelLeft, RotateCcw, X } from '@lucide/vue';
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  useConfirm,
} from '@memoflow/ui-vue-shadcn';
import UserPreferenceSettingsSection from '../components/UserPreferenceSettingsSection.vue';
import SettingsNavigation from '../components/SettingsNavigation.vue';
import {
  createSettingsSectionResetRegistry,
  provideSettingsSectionReset,
} from '../composables/useSettingsSectionReset';
import { settingUiHost } from '../setting-ui-host';

const KeyboardSettings = defineAsyncComponent(() => import('../components/KeyboardSettings.vue'));
const AISettings = defineAsyncComponent(() => import('../components/AISettings.vue'));
const KnowledgeRepositorySettings = defineAsyncComponent(
  () => import('../components/KnowledgeRepositorySettings.vue'),
);
const NotificationSettings = defineAsyncComponent(
  () => import('../components/NotificationSettings.vue'),
);
const AccountSettingsSection = defineAsyncComponent(
  () => import('../components/AccountSettingsSection.vue'),
);
const DataSettingsSection = defineAsyncComponent(
  () => import('../components/DataSettingsSection.vue'),
);
const DesktopStartupSettingsSection = defineAsyncComponent(
  () => import('../components/DesktopStartupSettingsSection.vue'),
);
const DesktopUpdateSettingsSection = defineAsyncComponent(
  () => import('../components/DesktopUpdateSettingsSection.vue'),
);

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    /** Section shown when the shell dialog opens the view. */
    initialTab?: string;
  }>(),
  {
    initialTab: undefined,
  },
);
const emit = defineEmits<{ close: [] }>();

const shellStore = settingUiHost.useAppShellStore();
const desktopStartupService = inject(settingUiHost.DESKTOP_STARTUP_SERVICE_KEY, null);
const desktopUpdateService = inject(settingUiHost.DESKTOP_UPDATE_SERVICE_KEY, null);
const SETTINGS_NARROW_VIEWPORT = 1024;
const contentWidth = ref(
  typeof window !== 'undefined' ? window.innerWidth : SETTINGS_NARROW_VIEWPORT,
);
const isNarrow = computed(() => contentWidth.value < SETTINGS_NARROW_VIEWPORT);
const settingsContentRef = ref<HTMLElement | null>(null);
let settingsResizeObserver: ResizeObserver | null = null;

type SettingsGroup =
  | 'shortcuts'
  | 'appearance'
  | 'repository'
  | 'ai'
  | 'notifications'
  | 'account'
  | 'data'
  | 'startup'
  | 'updates';

const GROUP_DEFINITIONS: ReadonlyArray<{
  value: SettingsGroup;
  labelKey: string;
}> = [
  { value: 'shortcuts', labelKey: 'setting.groups.shortcuts' },
  { value: 'appearance', labelKey: 'setting.groups.appearance' },
  { value: 'repository', labelKey: 'setting.groups.repository' },
  { value: 'ai', labelKey: 'setting.groups.ai' },
  { value: 'notifications', labelKey: 'setting.groups.notifications' },
  { value: 'account', labelKey: 'setting.groups.account' },
  { value: 'data', labelKey: 'setting.groups.data' },
  { value: 'startup', labelKey: 'setting.groups.startup' },
  { value: 'updates', labelKey: 'setting.groups.updates' },
];
const GROUP_VALUES: SettingsGroup[] = GROUP_DEFINITIONS.map((group) => group.value);

function isGroupAvailable(group: SettingsGroup): boolean {
  if (group === 'startup') return desktopStartupService !== null;
  return group !== 'updates' || desktopUpdateService !== null;
}

function normalizeGroup(value: unknown): SettingsGroup {
  // Keep old Settings -> AI permissions deep links landing on the merged section.
  if (value === 'ai-permissions') return 'ai';
  const candidate = value as SettingsGroup;
  return GROUP_VALUES.includes(candidate) && isGroupAvailable(candidate) ? candidate : 'appearance';
}

const activeTab = ref<SettingsGroup>(normalizeGroup(props.initialTab));
const groups = computed(() =>
  GROUP_DEFINITIONS.filter((group) => isGroupAvailable(group.value)).map((group) => ({
    value: group.value,
    label: t(group.labelKey),
  })),
);
const activeLabel = computed(
  () => groups.value.find((group) => group.value === activeTab.value)?.label ?? t('setting.title'),
);

function selectGroup(group: SettingsGroup | string): void {
  activeTab.value = normalizeGroup(group);
  if (isNarrow.value) shellStore.setSettingsNavigationOpen(false);
}

function openNavigation(): void {
  shellStore.setSettingsNavigationOpen(true);
}

function closeSettings(): void {
  emit('close');
}

// Section-level restore defaults: sections register the action they already own, so
// the shell never re-implements a section's mutation. Sections without one hide it.
const sectionResetRegistry = createSettingsSectionResetRegistry();
provideSettingsSectionReset(sectionResetRegistry);
const canResetActiveSection = computed(() => sectionResetRegistry.has(activeTab.value));
const resetting = ref(false);

async function restoreActiveSectionDefaults(): Promise<void> {
  const action = sectionResetRegistry.action(activeTab.value);
  if (!action) return;
  const confirmed = await useConfirm({
    title: t('setting.restoreDefaults.title', { section: activeLabel.value }),
    description: t('setting.restoreDefaults.description'),
    confirmText: t('setting.restoreDefaults.confirm'),
    cancelText: t('setting.restoreDefaults.cancel'),
  });
  if (!confirmed) return;
  resetting.value = true;
  try {
    await action();
  } catch {
    // The owning section reports its own failure next to its content.
  } finally {
    resetting.value = false;
  }
}

watch(isNarrow, (narrow) => shellStore.setSettingsNavigationOpen(!narrow), {
  immediate: true,
});

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && settingsContentRef.value) {
    settingsResizeObserver = new ResizeObserver(([entry]) => {
      if (entry) contentWidth.value = entry.contentRect.width;
    });
    settingsResizeObserver.observe(settingsContentRef.value);
  }
});

onBeforeUnmount(() => {
  settingsResizeObserver?.disconnect();
  settingsResizeObserver = null;
});
</script>

<template>
  <div
    ref="settingsContentRef"
    class="flex h-full min-h-0 min-w-0 overflow-hidden bg-background"
    data-testid="user-settings-view"
  >
    <aside
      v-if="!isNarrow && shellStore.settingsNavigationOpen"
      class="h-full w-60 shrink-0 border-r border-sidebar-border"
      data-testid="settings-group-sidebar"
    >
      <SettingsNavigation :items="groups" :active="activeTab" @select="selectGroup" />
    </aside>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header
        class="flex h-12 shrink-0 items-center gap-3 border-b border-[hsl(var(--border-subtle))] pe-2 ps-5"
        data-testid="settings-shell-header"
      >
        <button
          v-if="isNarrow"
          type="button"
          class="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="t('setting.nav.open')"
          data-testid="settings-nav-trigger"
          @click="openNavigation"
        >
          <PanelLeft class="size-4" aria-hidden="true" />
        </button>

        <nav class="min-w-0" :aria-label="t('setting.breadcrumb.label')">
          <ol class="m-0 flex min-w-0 list-none items-center gap-2 p-0 text-sm">
            <li class="flex shrink-0 items-center font-medium text-muted-foreground">
              {{ t('setting.title') }}
            </li>
            <li aria-hidden="true" class="flex shrink-0 items-center text-muted-foreground/60">
              /
            </li>
            <li aria-current="page" class="flex min-w-0 items-center font-medium">
              <span class="truncate" data-testid="settings-breadcrumb-current">
                {{ activeLabel }}
              </span>
            </li>
          </ol>
        </nav>

        <div class="ms-auto flex shrink-0 items-center gap-1">
          <Button
            v-if="canResetActiveSection"
            type="button"
            variant="ghost"
            size="xs"
            class="gap-1.5"
            :disabled="resetting"
            data-testid="settings-restore-defaults"
            @click="restoreActiveSectionDefaults"
          >
            <RotateCcw class="size-3.5" aria-hidden="true" />
            <span class="max-sm:sr-only">{{ t('setting.restoreDefaults.label') }}</span>
          </Button>
          <button
            type="button"
            class="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="t('common.close')"
            data-testid="settings-close"
            @click="closeSettings"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main
        class="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-stable"
        data-testid="settings-content-scroll"
      >
        <div
          class="mx-auto w-full px-5 py-8 sm:px-8 sm:py-10"
          :class="activeTab === 'ai' ? 'max-w-[1064px]' : 'max-w-4xl'"
        >
          <div class="min-w-0 space-y-8">
            <UserPreferenceSettingsSection v-if="activeTab === 'appearance'" />
            <KeyboardSettings v-else-if="activeTab === 'shortcuts'" />
            <AISettings v-else-if="activeTab === 'ai'" />
            <KnowledgeRepositorySettings v-else-if="activeTab === 'repository'" />
            <NotificationSettings v-else-if="activeTab === 'notifications'" />
            <AccountSettingsSection v-else-if="activeTab === 'account'" />
            <DataSettingsSection v-else-if="activeTab === 'data'" />
            <DesktopStartupSettingsSection v-else-if="activeTab === 'startup'" />
            <DesktopUpdateSettingsSection v-else-if="activeTab === 'updates'" />
          </div>
        </div>
      </main>
    </div>

    <Sheet
      v-if="isNarrow"
      :open="shellStore.settingsNavigationOpen"
      @update:open="shellStore.setSettingsNavigationOpen($event)"
    >
      <SheetContent
        :close-label="t('common.close')"
        side="left"
        class="w-[min(20rem,88vw)] border-r border-sidebar-border bg-sidebar p-0"
        data-testid="settings-navigation-drawer"
      >
        <SheetTitle class="sr-only">{{ t('setting.title') }}</SheetTitle>
        <SheetDescription class="sr-only">{{ t('setting.title') }}</SheetDescription>
        <SettingsNavigation :items="groups" :active="activeTab" @select="selectGroup" />
      </SheetContent>
    </Sheet>
  </div>
</template>
