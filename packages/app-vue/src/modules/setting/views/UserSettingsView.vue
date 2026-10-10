<script setup lang="ts">
/**
 * UserSettingsView — Settings Hub composition root.
 *
 * The root owns navigation/layout only. Each section owns its own capability client,
 * loading/error/mutation state. `?tab=` and `settings-tab-{value}` remain the stable
 * deep-link/E2E contract.
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
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowLeft } from '@lucide/vue';
import { Button, Sheet, SheetContent, SheetDescription, SheetTitle } from '@memoflow/ui-vue-shadcn';
import UserPreferenceSettingsSection from '../components/UserPreferenceSettingsSection.vue';
import SettingsNavigation from '../components/SettingsNavigation.vue';
import { useAppShellStore } from '../../../layouts/shell/useAppShellStore';
import { returnFromSettingsScene } from '../../../layouts/shell/useShellRouterSync';
import { ProductSurfaceHeader } from '../../../shared/components';
import { DESKTOP_UPDATE_SERVICE_KEY } from '../../../di/keys';

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
const DesktopUpdateSettingsSection = defineAsyncComponent(
  () => import('../components/DesktopUpdateSettingsSection.vue'),
);

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const shellStore = useAppShellStore();
const desktopUpdateService = inject(DESKTOP_UPDATE_SERVICE_KEY, null);
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
  | 'updates';

const GROUP_DEFINITIONS: ReadonlyArray<{ value: SettingsGroup; labelKey: string }> = [
  { value: 'shortcuts', labelKey: 'setting.groups.shortcuts' },
  { value: 'appearance', labelKey: 'setting.groups.appearance' },
  { value: 'repository', labelKey: 'setting.groups.repository' },
  { value: 'ai', labelKey: 'setting.groups.ai' },
  { value: 'notifications', labelKey: 'setting.groups.notifications' },
  { value: 'account', labelKey: 'setting.groups.account' },
  { value: 'data', labelKey: 'setting.groups.data' },
  { value: 'updates', labelKey: 'setting.groups.updates' },
];
const GROUP_VALUES: SettingsGroup[] = GROUP_DEFINITIONS.map((group) => group.value);

function isGroupAvailable(group: SettingsGroup): boolean {
  return group !== 'updates' || desktopUpdateService !== null;
}

function normalizeGroup(value: unknown): SettingsGroup {
  const candidate = value as SettingsGroup;
  return GROUP_VALUES.includes(candidate) && isGroupAvailable(candidate) ? candidate : 'appearance';
}

const activeTab = ref<SettingsGroup>(normalizeGroup(route.query.tab));
const groups = computed(() =>
  GROUP_DEFINITIONS.filter((group) => isGroupAvailable(group.value)).map((group) => ({
    value: group.value,
    label: t(group.labelKey),
  })),
);

watch(
  () => route.query.tab,
  (tab) => {
    const next = normalizeGroup(tab);
    if (next !== activeTab.value) activeTab.value = next;
  },
);

function selectGroup(group: SettingsGroup | string): void {
  const normalized = normalizeGroup(group);
  activeTab.value = normalized;
  if (route.query.tab !== normalized) {
    void router.replace({ query: { ...route.query, tab: normalized } });
  }
  if (isNarrow.value) shellStore.setSettingsNavigationOpen(false);
}

function returnToApp(): void {
  void returnFromSettingsScene(router, shellStore, route.fullPath);
}

watch(isNarrow, (narrow) => shellStore.setSettingsNavigationOpen(!narrow), { immediate: true });

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
      <SettingsNavigation
        :items="groups"
        :active="activeTab"
        @select="selectGroup"
        @return-to-app="returnToApp"
      />
    </aside>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ProductSurfaceHeader v-if="isNarrow" family="settings" data-testid="settings-compact-header">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="gap-2 px-2"
          data-testid="settings-compact-back"
          @click="returnToApp"
        >
          <ArrowLeft class="h-4 w-4" />
          <span class="font-semibold">{{ t('setting.title') }}</span>
        </Button>
      </ProductSurfaceHeader>

      <main class="min-h-0 flex-1 overflow-y-auto" data-testid="settings-content-scroll">
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
        <SettingsNavigation
          :items="groups"
          :active="activeTab"
          @select="selectGroup"
          @return-to-app="returnToApp"
        />
      </SheetContent>
    </Sheet>
  </div>
</template>
