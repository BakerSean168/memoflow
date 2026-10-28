/**
 * Setting UI host binding (renderer composition root, Issue #630 §4.9).
 *
 * `@memoflow/setting-ui` owns the Settings surfaces but must not import
 * `@memoflow/app-vue`, the AI / account / repository scopes or
 * `@memoflow/notification-ui`. DI keys, server-state, product time, i18n/theme
 * sync, the keyboard runtime, platform bridges and the cross-domain facades stay
 * owned here; this module is the single place where they are handed over.
 */
import { bindSettingUiHost } from '@memoflow/setting-ui/host';
import {
  browserSystemNotificationPermission,
  isBrowserSystemNotificationEnabled,
  isBrowserSystemNotificationSupported,
  requestBrowserSystemNotificationPermission,
  setBrowserSystemNotificationEnabled,
  useNotificationPreferences,
} from '@memoflow/notification-ui';
import {
  SettingsDangerZone,
  SettingsDialogShell,
  SettingsObjectCard,
  SettingsPropertyRow,
  SettingsSection,
  SettingsStatusBlock,
} from '../components/shared/settings';
import AgentDriverIcon from '@memoflow/ai-ui/components/AgentDriverIcon.vue';
import {
  AccountProfileSection,
  CloudPasswordSection,
  ExternalAgentConnectionsSection,
} from '@memoflow/account-ui';
import { KnowledgeWriteRequestLedger } from '@memoflow/repository-ui';
import {
  getAIErrorMessage,
  getNativeAgentExecutionFailureMessage,
} from '@memoflow/ai-ui/composables/error';
import { useAI } from '@memoflow/ai-ui/composables/useAI';
import { useNativeModelVisibility } from '@memoflow/ai-ui/composables/nativeModelVisibility';
import { sortAgentInstances } from '@memoflow/ai-ui/agent-instance-order';
import ProductSurfaceHeader from '../shared/components/ProductSurfaceHeader.vue';
import ReleaseNotes from '../shared/components/ReleaseNotes.vue';
import { useAppShellStore } from '../layouts/shell/useAppShellStore';
import { returnFromSettingsScene } from '../layouts/shell/useShellRouterSync';
import {
  displayChord,
  eventChord,
  normalizeChord,
  validateKeymap,
} from '../shared/keyboard/keymap';
import { keyboard } from '../shared/keyboard/runtime';
import { saveDeviceKeymap } from '../shared/keyboard/device-keymap';
import { readDesktopAccessSnapshot } from '../shared/utils/desktop-profile-access';
import { getDesktopAuthApi } from '../shared/utils/desktop-auth-recovery';
import { normalizeSelectString } from '../shared/utils/normalize-select-string';
import { setProductTimePreferences } from '../shared/utils/product-time';
import { getGlobalResultErrorT } from '../shared/utils/translate-result-error';
import { setI18nLocale } from '../plugins/i18n';
import {
  AI_AGENT_REGISTRY_KEY,
  AI_LOCAL_AGENT_KEY,
  AUTH_SERVICE_KEY,
  DATA_PORTABILITY_SERVICE_KEY,
  DESKTOP_ACCESS_SNAPSHOT_KEY,
  DESKTOP_AUTH_API_KEY,
  DESKTOP_BRIDGE_KEY,
  DESKTOP_NOTIFICATION_DEVICE_PREFERENCE_KEY,
  DESKTOP_UPDATE_SERVICE_KEY,
  EXTERNAL_AGENT_SERVICE_KEY,
  REPOSITORY_SERVICE_KEY,
  SETTING_SERVICE_KEY,
} from './keys';
import { installPlatformRendererHost } from './platform-ui-host';
import type { SettingUiHost } from '@memoflow/setting-ui/host';

/** Bind the renderer capabilities the Settings surfaces rely on before mounting them. */
export function installSettingUiHost(): void {
  bindSettingUiHost({
    ...installPlatformRendererHost(),
    SETTING_SERVICE_KEY,
    DATA_PORTABILITY_SERVICE_KEY,
    DESKTOP_AUTH_API_KEY,
    DESKTOP_BRIDGE_KEY,
    DESKTOP_ACCESS_SNAPSHOT_KEY,
    DESKTOP_NOTIFICATION_DEVICE_PREFERENCE_KEY,
    DESKTOP_UPDATE_SERVICE_KEY,
    AI_AGENT_REGISTRY_KEY,
    AI_LOCAL_AGENT_KEY,
    AUTH_SERVICE_KEY,
    EXTERNAL_AGENT_SERVICE_KEY,
    REPOSITORY_SERVICE_KEY,
    getGlobalResultErrorT,
    normalizeSelectString,
    readDesktopAccessSnapshot,
    getDesktopAuthApi,
    setProductTimePreferences,
    setI18nLocale,
    keyboard,
    eventChord,
    normalizeChord,
    displayChord,
    validateKeymap,
    saveDeviceKeymap,
    useAiFacade: useAI,
    getAIErrorMessage,
    getNativeAgentExecutionFailureMessage,
    sortAgentInstances,
    useNativeModelVisibility,
    useNotificationPreferences,
    browserNotification: {
      permission: browserSystemNotificationPermission,
      isEnabled: isBrowserSystemNotificationEnabled,
      isSupported: isBrowserSystemNotificationSupported,
      requestPermission: requestBrowserSystemNotificationPermission,
      setEnabled: setBrowserSystemNotificationEnabled,
    },
    useAppShellStore,
    returnFromSettingsScene,
    components: {
      SettingsPropertyRow,
      SettingsSection,
      SettingsStatusBlock,
      SettingsDangerZone,
      SettingsDialogShell,
      SettingsObjectCard,
      ReleaseNotes,
      ProductSurfaceHeader,
      AgentDriverIcon,
      AccountProfileSection,
      CloudPasswordSection,
      ExternalAgentConnectionsSection,
      KnowledgeWriteRequestLedger,
    },
  } satisfies SettingUiHost);
}
