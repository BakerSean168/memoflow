<script setup lang="ts">
/**
 * UserSettingsView — Settings Hub composition root.
 *
 * The root owns navigation/layout only. Each section owns its own capability client,
 * loading/error/mutation state. `?tab=` and `settings-tab-{value}` remain the stable
 * deep-link/E2E contract.
 */
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import UserPreferenceSettingsSection from '../components/UserPreferenceSettingsSection.vue';

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

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const SETTINGS_NARROW_VIEWPORT = 1024;
const contentWidth = ref(
  typeof window !== 'undefined' ? window.innerWidth : SETTINGS_NARROW_VIEWPORT,
);
const isNarrow = computed(() => contentWidth.value < SETTINGS_NARROW_VIEWPORT);
const settingsContentRef = ref<HTMLElement | null>(null);
let settingsResizeObserver: ResizeObserver | null = null;

type SettingsGroup = 'appearance' | 'repository' | 'ai' | 'notifications' | 'account' | 'data';

const GROUP_DEFINITIONS: ReadonlyArray<{ value: SettingsGroup; labelKey: string }> = [
  { value: 'appearance', labelKey: 'setting.groups.appearance' },
  { value: 'repository', labelKey: 'setting.groups.repository' },
  { value: 'ai', labelKey: 'setting.groups.ai' },
  { value: 'notifications', labelKey: 'setting.groups.notifications' },
  { value: 'account', labelKey: 'setting.groups.account' },
  { value: 'data', labelKey: 'setting.groups.data' },
];
const GROUP_VALUES: SettingsGroup[] = GROUP_DEFINITIONS.map((group) => group.value);

function normalizeGroup(value: unknown): SettingsGroup {
  return GROUP_VALUES.includes(value as SettingsGroup) ? (value as SettingsGroup) : 'appearance';
}

const activeTab = ref<SettingsGroup>(normalizeGroup(route.query.tab));
const groups = computed(() =>
  GROUP_DEFINITIONS.map((group) => ({ value: group.value, label: t(group.labelKey) })),
);

watch(
  () => route.query.tab,
  (tab) => {
    const next = normalizeGroup(tab);
    if (next !== activeTab.value) activeTab.value = next;
  },
);

function selectGroup(group: SettingsGroup): void {
  activeTab.value = group;
  if (route.query.tab !== group) {
    void router.replace({ query: { ...route.query, tab: group } });
  }
}

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
    class="min-h-full min-w-0 overflow-hidden bg-background"
    data-testid="user-settings-view"
  >
    <div class="mx-auto max-w-5xl px-6 py-8">
      <div
        class="flex min-h-0 gap-6"
        :class="isNarrow ? 'flex-col' : 'flex-row'"
        data-testid="settings-panel-layout"
      >
        <nav
          class="flex shrink-0 gap-1"
          :class="
            isNarrow ? 'overflow-x-auto' : 'sticky top-0 w-48 flex-col self-start overflow-visible'
          "
          :data-testid="isNarrow ? 'settings-group-tabs' : 'settings-group-sidebar'"
          :aria-label="t('setting.title')"
        >
          <button
            v-for="group in groups"
            :key="group.value"
            :data-testid="`settings-tab-${group.value}`"
            type="button"
            :aria-current="activeTab === group.value ? 'page' : undefined"
            class="whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors"
            :class="
              activeTab === group.value
                ? 'bg-secondary font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            "
            @click="selectGroup(group.value)"
          >
            {{ group.label }}
          </button>
        </nav>

        <div class="min-w-0 max-w-3xl flex-1 space-y-8">
          <UserPreferenceSettingsSection v-if="activeTab === 'appearance'" />
          <AISettings v-else-if="activeTab === 'ai'" />
          <KnowledgeRepositorySettings v-else-if="activeTab === 'repository'" />
          <NotificationSettings v-else-if="activeTab === 'notifications'" />
          <AccountSettingsSection v-else-if="activeTab === 'account'" />
          <DataSettingsSection v-else-if="activeTab === 'data'" />
        </div>
      </div>
    </div>
  </div>
</template>
