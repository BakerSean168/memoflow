import {
  ProfileAccessChannels,
  type DesktopAccessSnapshot,
  type ProfileSummary,
} from '@memoflow/desktop-contracts';
import { fromIpcResult, isOk, type IpcResult } from '@memoflow/transport-contracts/result';
import type { DesktopAuthApi } from './desktop-auth-recovery';

/**
 * The quick-enter rule shared by the account tile and the launch-time automatic
 * entry (#926): a registered Profile opens with its own key, and a local
 * account opens only while its remembered key copy exists. Anything else needs
 * a password in the identity window and can never enter automatically.
 */
export function canQuickEnterProfile(profile: ProfileSummary): boolean {
  return profile.profileKind === 'registered' || profile.remembered;
}

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
