import { ref, type Component, type InjectionKey, type Ref } from 'vue';
import type { DesktopAccessSnapshot } from '@memoflow/desktop-contracts';
import type { ElectronBridge } from '@memoflow/ipc-client';
import type { CloudAuthClientPort } from '@memoflow/cloud-auth-contracts';
import type { ExternalAgentClientPort } from '@memoflow/agent-gateway';
import type { AccountClientPort } from '@memoflow/account-client';
import type { PlatformRendererHost } from '@memoflow/ui-host-contracts';
import type { AccountAvatarStore } from './account/avatar/account-avatar-store';

/**
 * Shell → host intent for the profile editor (Issue #856).
 *
 * The sidebar account card only raises the intent. Issue #857 owns the dialog:
 * it reads {@link ProfileEditorIntent.open} and closes it. Keeping the flag on
 * the host boundary means the dialog can mount anywhere above the sidebar
 * without threading another callback through the shell.
 */
export interface ProfileEditorIntent {
  /** True while the profile editor surface should be visible. */
  open: Ref<boolean>;
  /** Ask the host to show the profile editor for the active account. */
  request(): void;
}

/** Create the shell-owned profile editor intent (no account data is stored). */
export function createProfileEditorIntent(): ProfileEditorIntent {
  const open = ref(false);
  return {
    open,
    request() {
      open.value = true;
    },
  };
}

/**
 * Renderer composition dependencies for the Account UI package.
 *
 * The host retains DI keys, i18n, product time, shared settings components and
 * the desktop bridge ownership. Account UI sources never import the host app.
 * Platform-level capabilities come from {@link PlatformRendererHost}; this port
 * only declares the Account slots.
 */
export interface AccountUiHost extends PlatformRendererHost {
  ACCOUNT_SERVICE_KEY: InjectionKey<AccountClientPort>;
  AUTH_SERVICE_KEY: InjectionKey<CloudAuthClientPort>;
  EXTERNAL_AGENT_SERVICE_KEY: InjectionKey<ExternalAgentClientPort>;
  DESKTOP_ACCESS_SNAPSHOT_KEY: InjectionKey<Ref<DesktopAccessSnapshot | null>>;
  DESKTOP_BRIDGE_KEY: InjectionKey<ElectronBridge>;
  /** Platform avatar persistence (desktop Profile directory / web storage). */
  ACCOUNT_AVATAR_STORE_KEY: InjectionKey<AccountAvatarStore>;
  /**
   * Profile editor intent (Issue #856). The shell account card requests it and
   * Issue #857's dialog consumes it; the shell composition root provides it.
   */
  PROFILE_EDITOR_INTENT_KEY: InjectionKey<ProfileEditorIntent>;
  /**
   * Execution-only sign-out handler: the host performs the platform sign-out.
   * Confirmation belongs to {@link useAccountSignOut} so both entries ask once.
   */
  LOGOUT_HANDLER_KEY: InjectionKey<() => Promise<void>>;

  components: Record<'SettingsSection' | 'SettingsDangerZone', Component>;
}

// Bound once in the renderer composition root. Holds no user state: every function
// still consults the host's existing DI, i18n and time owners.
export let accountUiHost: AccountUiHost;
export function bindAccountUiHost(host: AccountUiHost): void {
  accountUiHost = host;
}
