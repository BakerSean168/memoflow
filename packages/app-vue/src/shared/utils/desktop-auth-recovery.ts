import { ProfileAccessChannels, type DesktopAccessSnapshot } from '@memoflow/contracts/electron';
import { fromIpcResult, isOk, type IpcResult } from '@memoflow/contracts/result';

// Residual 903: sole desktop invoke-api shape DesktopAuthApi.
// Residual 919: DesktopBootstrapApi name dual fully retired — hydrate uses DesktopAuthApi.
// Residual 905: reminder DesktopApi dual retired — use DesktopAuthApi sole body.
// Residual 907: setting themeSync inline electronAPI dual retired — use DesktopAuthApi.
// Residual 909: app-vue Window.electronAPI + desktop-detect duals retired — use DesktopAuthApi.
// Residual 913: remaining host-access cast duals retired — use getDesktopAuthApi/hasDesktopAuthApi.
// Residual 915: DESKTOP_AUTH_API_KEY InjectionKey dual retired — InjectionKey<DesktopAuthApi>.
// Residual 923: isDesktopEnvironment name dual retired — callers use hasDesktopAuthApi directly.
export type DesktopAuthApi = {
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
};

type DesktopAuthHost = object | null | undefined;

// Residual 901: local DesktopAuthStatus dual retired — sole status shape is contracts AuthStatus
// (residual 865 already deleted AuthStatusDTO; recovery must not reintroduce a slim dual body).

type DesktopAuthErrorLike =
  | {
      code?: string | null;
    }
  | null
  | undefined;

export function isDesktopAuthRecoverable(error: DesktopAuthErrorLike): boolean {
  return error?.code === 'AUTH_REQUIRED' || error?.code === 'AUTH_RESTORING';
}

export function getDesktopAuthApi(host?: DesktopAuthHost): DesktopAuthApi | undefined {
  return (host as { electronAPI?: DesktopAuthApi } | null | undefined)?.electronAPI;
}

// Residual 909: sole desktop-detect helper (no inline { invoke?: unknown } duals at call sites).
export function hasDesktopAuthApi(host?: DesktopAuthHost): boolean {
  return typeof getDesktopAuthApi(host)?.invoke === 'function';
}

async function readAccessSnapshot(api: DesktopAuthApi): Promise<DesktopAccessSnapshot | null> {
  const response = (await api.invoke!(
    ProfileAccessChannels.GET_SNAPSHOT,
  )) as IpcResult<DesktopAccessSnapshot>;
  const result = fromIpcResult(response);
  return isOk(result) ? result.data : null;
}

export async function ensureDesktopAuthReadyWithApi(
  api?: DesktopAuthApi,
  logScope = 'DesktopAuthRecovery',
): Promise<boolean> {
  if (!api?.invoke) {
    return false;
  }

  try {
    const snapshot = await readAccessSnapshot(api);
    return snapshot?.unlockState === 'UNLOCKED';
  } catch (error) {
    console.warn(`[${logScope}] Failed to ensure desktop auth readiness`, error);
  }

  return false;
}

export async function recoverDesktopAuthIfNeeded(
  error: DesktopAuthErrorLike,
  api?: DesktopAuthApi,
  logScope = 'DesktopAuthRecovery',
): Promise<boolean> {
  if (!isDesktopAuthRecoverable(error)) {
    return false;
  }

  return ensureDesktopAuthReadyWithApi(api, logScope);
}
