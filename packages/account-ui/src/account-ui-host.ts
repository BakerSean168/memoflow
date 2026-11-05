import type { Component, InjectionKey, Ref } from 'vue';
import type { DesktopAccessSnapshot } from '@memoflow/desktop-contracts';
import type { ElectronBridge } from '@memoflow/ipc-client';
import type { CloudAuthClientPort } from '@memoflow/cloud-auth-contracts';
import type { ExternalAgentClientPort } from '@memoflow/agent-gateway';
import type { AccountClientPort } from '@memoflow/account-client';
import type { PlatformRendererHost } from '@memoflow/ui-host-contracts';
import type { AccountAvatarStore } from './account/avatar/account-avatar-store';

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
