import type { Component, InjectionKey, Ref } from 'vue';
import type { DesktopAccessSnapshot } from '@memoflow/desktop-contracts';
import type { ElectronBridge } from '@memoflow/ipc-client';
import type { ResultErrorTranslateFn } from '@memoflow/http-client';
import type { CloudAuthClientPort } from '@memoflow/cloud-auth-contracts';
import type { ExternalAgentClientPort } from '@memoflow/agent-gateway';
import type { AccountClientPort } from '@memoflow/account-client';

/** Translation helper signature owned by the host i18n platform. */
export type AccountTranslateFn = ResultErrorTranslateFn;

/** Structured Result-error translator owned by the host error-reporting seam. */
export interface AccountTranslateResultErrorOptions {
  scope?: string;
  fallbackKey: string;
  [key: string]: unknown;
}

/**
 * Renderer composition dependencies for the Account UI package.
 *
 * The host retains DI keys, i18n, product time, shared settings components and
 * the desktop bridge ownership. Account UI sources never import the host app.
 */
export interface AccountUiHost {
  ACCOUNT_SERVICE_KEY: InjectionKey<AccountClientPort>;
  AUTH_SERVICE_KEY: InjectionKey<CloudAuthClientPort>;
  EXTERNAL_AGENT_SERVICE_KEY: InjectionKey<ExternalAgentClientPort>;
  DESKTOP_ACCESS_SNAPSHOT_KEY: InjectionKey<Ref<DesktopAccessSnapshot | null>>;
  DESKTOP_BRIDGE_KEY: InjectionKey<ElectronBridge>;
  LOGOUT_HANDLER_KEY: InjectionKey<() => void>;
  PROFILE_LOCK_HANDLER_KEY: InjectionKey<() => Promise<void>>;

  useStrictInject<T>(key: InjectionKey<T>, name?: string): T;
  translateResultError(
    error: unknown,
    t: AccountTranslateFn,
    options: AccountTranslateResultErrorOptions,
  ): string;
  createComposableHandleError(options: {
    t: AccountTranslateFn;
    setError(message: string | null): void;
    report?(message: string): void;
  }): (error: unknown, fallbackKey: string) => void;

  formatProductDateTime(value: number | string | Date | null | undefined, empty?: string): string;

  components: Record<'SettingsSection' | 'SettingsDangerZone', Component>;
}

// Bound once in the renderer composition root. Holds no user state: every function
// still consults the host's existing DI, i18n and time owners.
export let accountUiHost: AccountUiHost;
export function bindAccountUiHost(host: AccountUiHost): void {
  accountUiHost = host;
}
