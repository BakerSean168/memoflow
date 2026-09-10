<script setup lang="ts">
/**
 * UserSettingsView — 设置页（UI 重构 V2 § Settings / §7；沿 V1 §13 分组方案）
 *
 * 10 个平铺 Tab 重组为 7 组：
 *   外观与语言 / 知识库 / AI / 通知与提醒 / 账户（账户中心迁入）/ 数据 / 高级
 * 分组定义集中在 `GROUP_DEFINITIONS` 单一模型（值 + i18n label key），
 * `groups` 与 `GROUP_VALUES` 均由其派生，避免注释/代码漂移。
 * 设置内容容器窄于 1024px 时使用顶部分组 tabs；宽容器使用左侧垂直分组导航
 * （sticky，长页面滚动时保持可见）。
 * `?tab=` 查询参数为分组深链契约（/account/center redirect 依赖）。
 * `settings-tab-{value}` testid 保留（appearance / notifications 被 e2e 锚定）。
 * 作为 AppShell STATE D 独立场景渲染，不进 BusinessPanel。
 */

import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Loader2 } from '@lucide/vue';
import { SystemChannels } from '@memoflow/contracts/electron';
import { isOk, type Result } from '@memoflow/contracts/result';

import AppearanceSettings from '../components/AppearanceSettings.vue';
import AISettings from '../components/AISettings.vue';
import LocaleSettings from '../components/LocaleSettings.vue';
import KnowledgeRepositorySettings from '../components/KnowledgeRepositorySettings.vue';
import NotificationSettings from '../components/NotificationSettings.vue';
import SettingAdvancedActions from '../components/SettingAdvancedActions.vue';
import SettingsResetSection from '../components/SettingsResetSection.vue';
import UserFilesSettings from '../components/UserFilesSettings.vue';
import { AccountProfileSection, CloudPasswordSection } from '../../account/components';

import { useUserSetting } from '../composables/useUserSetting';
import { useUserPreferences } from '../composables/useUserPreferences';
import { useDataPortability } from '../composables/useDataPortability';
import { applyThemeMode } from '../composables';
import { setProductTimePreferences } from '../../../shared/utils/product-time';
import { usePresentationPreferenceStore } from '../stores/presentation-preference-store';
import type { AppLocale } from '../../../plugins/i18n';
import { DEFAULT_USER_PREFERENCE_PROFILE } from '@memoflow/contracts/setting';
import type {
  PresentationPreferences,
  RegionalPreferences,
  UserPreferenceProfile,
} from '@memoflow/contracts/setting';
import { inject } from 'vue';
import { AUTH_SERVICE_KEY, DESKTOP_AUTH_API_KEY } from '../../../di/keys';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const presentationStore = usePresentationPreferenceStore();
const desktopApi = inject(DESKTOP_AUTH_API_KEY, undefined);
// Cloud password management is a host capability: Web provides the full
// CloudAuthClientPort, while Desktop currently exposes only its narrower
// device-authorization/session port. Do not mount the strict password
// composable unless the host actually provides AUTH_SERVICE_KEY.
const cloudPasswordService = inject(AUTH_SERVICE_KEY, null);
// 独立设置场景：适配依据设置内容容器，而不是整个窗口。
const SETTINGS_NARROW_VIEWPORT = 1024;
const contentWidth = ref(
  typeof window !== 'undefined' ? window.innerWidth : SETTINGS_NARROW_VIEWPORT,
);
const isNarrow = computed(() => contentWidth.value < SETTINGS_NARROW_VIEWPORT);
const settingsContentRef = ref<HTMLElement | null>(null);
let settingsResizeObserver: ResizeObserver | null = null;

const { isLoading, loadSettings, exportSettings, importSettings } = useUserSetting();

const {
  presentation: presentationPreference,
  regional: regionalPreference,
  isLoading: isPreferenceLoading,
  loadPreferences,
  patchPresentation,
  patchRegional,
} = useUserPreferences();

const isPageLoading = computed(() => isLoading.value || isPreferenceLoading.value);

const {
  isAvailable: isDataPortabilityAvailable,
  isServerDisclosureAvailable,
  isExporting: isExportingData,
  isExportingServerDisclosure,
  isImporting: isImportingData,
  lastResult: dataPortabilityResult,
  exportAllData,
  exportServerHeldDataDisclosure,
  importAllData,
} = useDataPortability();

// ── 分组导航（§13-3；Phase 3 单一模型）──
type SettingsGroup =
  'appearance' | 'repository' | 'ai' | 'notifications' | 'account' | 'data' | 'advanced';

/** 分组定义唯一来源：value + i18n label key。groups / GROUP_VALUES 由此派生。 */
const GROUP_DEFINITIONS: ReadonlyArray<{
  value: SettingsGroup;
  labelKey: string;
}> = [
  { value: 'appearance', labelKey: 'setting.groups.appearance' },
  { value: 'repository', labelKey: 'setting.groups.repository' },
  { value: 'ai', labelKey: 'setting.groups.ai' },
  { value: 'notifications', labelKey: 'setting.groups.notifications' },
  { value: 'account', labelKey: 'setting.groups.account' },
  { value: 'data', labelKey: 'setting.groups.data' },
  { value: 'advanced', labelKey: 'setting.groups.advanced' },
];

const GROUP_VALUES: SettingsGroup[] = GROUP_DEFINITIONS.map((group) => group.value);

function normalizeGroup(value: unknown): SettingsGroup {
  return GROUP_VALUES.includes(value as SettingsGroup) ? (value as SettingsGroup) : 'appearance';
}

const activeTab = ref<SettingsGroup>(normalizeGroup(route.query.tab));

const groups = computed(() =>
  GROUP_DEFINITIONS.map((group) => ({ value: group.value, label: t(group.labelKey) })),
);

// `?tab=` 双向同步（深链契约）
watch(
  () => route.query.tab,
  (tab) => {
    const next = normalizeGroup(tab);
    if (next !== activeTab.value) {
      activeTab.value = next;
    }
  },
);

function selectGroup(group: SettingsGroup) {
  activeTab.value = group;
  if (route.query.tab !== group) {
    void router.replace({ query: { ...route.query, tab: group } });
  }
}

const fileInput = ref<HTMLInputElement | null>(null);
type LocaleFormState = RegionalPreferences & { language: PresentationPreferences['language'] };
type LocaleSettingsInput = LocaleFormState;

type OpenTextResult = {
  canceled: boolean;
  content: string | null;
};

interface Backup {
  key: string;
  label: string;
  time: number;
}

// ── Section models — local reactive copies for v-model ──
const appearance = ref<{ theme: PresentationPreferences['theme'] }>({ theme: 'auto' });

const locale = ref<LocaleFormState>({
  language: DEFAULT_USER_PREFERENCE_PROFILE.presentation.language,
  ...DEFAULT_USER_PREFERENCE_PROFILE.regional,
});

// Advanced state
const backups = ref<Backup[]>([]);
const syncStatus = ref(null);
const syncing = ref(false);

function isSupportedLocale(value: unknown): value is AppLocale {
  return value === 'zh-CN' || value === 'en-US';
}

/** Wrap importSettings for the @import event (which has no payload). */
async function handleImport() {
  const electronApi = desktopApi;
  if (electronApi?.invoke) {
    try {
      const response = (await electronApi.invoke(SystemChannels.USER_FILES_OPEN_TEXT, {
        subdirectory: 'exports',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })) as Result<OpenTextResult>;

      if (isOk(response) && !response.data.canceled && response.data.content) {
        await importSettings(JSON.parse(response.data.content));
      }
    } catch (err) {
      console.error('Failed to import settings JSON from desktop file dialog:', err);
    }
    return;
  }

  fileInput.value?.click();
}

function createSettingsExportFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `memoflow-settings-${timestamp}.json`;
}

async function handleExportJson() {
  const exported = await exportSettings();
  if (!exported) {
    return;
  }

  const electronApi = desktopApi;
  if (electronApi?.invoke) {
    try {
      const response = (await electronApi.invoke(SystemChannels.USER_FILES_SAVE_TEXT, {
        subdirectory: 'exports',
        defaultFileName: createSettingsExportFilename(),
        content: exported,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })) as Result<{ canceled: boolean; filePath: string | null }>;
      if (isOk(response)) {
        return;
      }
      console.error('Failed to export settings JSON via desktop file dialog:', response.error);
    } catch (err) {
      console.error('Failed to export settings JSON via desktop file dialog:', err);
    }
  }

  const blob = new Blob([exported], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = createSettingsExportFilename();
  link.click();
  URL.revokeObjectURL(url);
}

/** Handle file selection and read JSON content. */
async function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const content = e.target?.result as string;
      const data = JSON.parse(content);
      await importSettings(data);
    } catch (err) {
      console.error('Failed to parse settings JSON:', err);
    } finally {
      // Reset input so the same file can be selected again
      target.value = '';
    }
  };
  reader.readAsText(file);
}

async function handleAppearanceUpdate(value: { theme?: PresentationPreferences['theme'] }) {
  const nextTheme = value.theme ?? appearance.value.theme;
  const previous = appearance.value.theme;
  if (nextTheme === previous) return;

  appearance.value = { theme: nextTheme };
  presentationStore.setTheme(nextTheme);
  applyThemeMode(nextTheme);

  if (await patchPresentation({ theme: nextTheme })) return;

  appearance.value = { theme: previous };
  presentationStore.setTheme(previous);
  applyThemeMode(previous);
}

async function handleLocaleUpdate(value: LocaleSettingsInput) {
  const previous = { ...locale.value };
  locale.value = { ...value };

  if (isSupportedLocale(value.language)) presentationStore.setLocale(value.language);

  const presentationChanged = value.language !== previous.language;
  const regionalPatch: Partial<RegionalPreferences> = {};
  for (const key of ['timeZone', 'dateStyle', 'timeStyle', 'weekStartsOn'] as const) {
    if (value[key] !== previous[key]) regionalPatch[key] = value[key] as never;
  }

  const presentationOk = presentationChanged
    ? await patchPresentation({ language: value.language })
    : true;
  const regionalOk =
    Object.keys(regionalPatch).length > 0 ? await patchRegional(regionalPatch) : true;

  if (presentationOk && regionalOk) return;
  await loadPreferences();
  hydrateCanonicalPreferences();
}

function hydrateCanonicalPreferences() {
  const presentation = presentationPreference.value?.preferences;
  const regional = regionalPreference.value?.preferences;
  if (!presentation || !regional) return;

  appearance.value = { theme: presentation.theme };
  locale.value = { language: presentation.language, ...regional };

  const profile: UserPreferenceProfile = { presentation, regional };
  presentationStore.syncFromUserPreferenceProfile(profile);
  setProductTimePreferences(profile);
}

watch([presentationPreference, regionalPreference], hydrateCanonicalPreferences);

onMounted(async () => {
  if (typeof ResizeObserver !== 'undefined' && settingsContentRef.value) {
    settingsResizeObserver = new ResizeObserver(([entry]) => {
      if (entry) contentWidth.value = entry.contentRect.width;
    });
    settingsResizeObserver.observe(settingsContentRef.value);
  }
  await Promise.all([loadSettings(), loadPreferences()]);
  hydrateCanonicalPreferences();
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
    <!-- Hidden file input for importing settings -->
    <input
      ref="fileInput"
      type="file"
      accept=".json"
      class="hidden"
      aria-hidden="true"
      @change="onFileSelected"
    />

    <div class="mx-auto max-w-5xl px-6 py-8">
      <!-- Loading state -->
      <div v-if="isPageLoading" class="flex items-center justify-center py-12">
        <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
      </div>

      <div
        v-else
        class="flex min-h-0 gap-6"
        :class="isNarrow ? 'flex-col' : 'flex-row'"
        data-testid="settings-panel-layout"
      >
        <!-- 窄档：顶部分组横向 tabs；宽档：左侧垂直分组导航（V2 §7 / V1 §13-8）。
             Phase 3：宽档 nav sticky top-0（相对正文滚动容器），长页面滚动时保持可见。 -->
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

        <!-- 右侧内容 max-w-3xl（§13-3） -->
        <div class="min-w-0 max-w-3xl flex-1 space-y-8">
          <template v-if="activeTab === 'appearance'">
            <AppearanceSettings
              :model-value="appearance"
              @update:model-value="handleAppearanceUpdate"
            />
            <LocaleSettings :model-value="locale" @update:model-value="handleLocaleUpdate" />
          </template>

          <template v-else-if="activeTab === 'ai'">
            <AISettings />
          </template>

          <template v-else-if="activeTab === 'repository'">
            <KnowledgeRepositorySettings />
          </template>

          <template v-else-if="activeTab === 'notifications'">
            <NotificationSettings />
          </template>

          <template v-else-if="activeTab === 'account'">
            <AccountProfileSection />
            <CloudPasswordSection v-if="cloudPasswordService" />
          </template>

          <template v-else-if="activeTab === 'data'">
            <UserFilesSettings />
            <SettingAdvancedActions
              :backups="backups"
              :sync-status="syncStatus"
              :syncing="syncing"
              :exporting-data="isExportingData"
              :importing-data="isImportingData"
              :data-portability-available="isDataPortabilityAvailable"
              :server-data-disclosure-available="isServerDisclosureAvailable"
              :exporting-server-data-disclosure="isExportingServerDisclosure"
              :data-portability-result="dataPortabilityResult"
              @export-j-s-o-n="handleExportJson"
              @import="handleImport"
              @export-all-data="exportAllData"
              @export-server-data-disclosure="exportServerHeldDataDisclosure"
              @import-all-data="importAllData"
            />
          </template>

          <template v-else-if="activeTab === 'advanced'">
            <SettingsResetSection />
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
