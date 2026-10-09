import { ProfileAccessChannels, type DesktopAccessSnapshot } from '@memoflow/contracts/electron';
import { fromIpcResult, isOk, type IpcResult } from '@memoflow/contracts/result';
import type { DesktopAuthApi } from './desktop-auth-recovery';

export async function readDesktopAccessSnapshot(
  api?: DesktopAuthApi,
  options: { refreshCloud?: boolean } = {},
): Promise<DesktopAccessSnapshot | null> {
  if (!api?.invoke) return null;
  const response = (await api.invoke(
    options.refreshCloud
      ? ProfileAccessChannels.REFRESH_CLOUD_STATE
      : ProfileAccessChannels.GET_SNAPSHOT,
  )) as IpcResult<DesktopAccessSnapshot>;
  const result = fromIpcResult(response);
  return isOk(result) ? result.data : null;
}
