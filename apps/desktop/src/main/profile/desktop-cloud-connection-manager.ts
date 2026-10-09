import { BetterAuthSessionResponseSchema } from '@memoflow/contracts';
import type { ProfileCloudState } from '@memoflow/contracts/electron';
import { getApiBaseUrl } from '../utils/api-config';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
import type { ProfileDescriptor } from './profile-registry';
import { CloudSessionStore } from './cloud-session-store';

export class DesktopCloudConnectionManager {
  constructor(
    private readonly sessions: CloudSessionStore,
    private readonly runtime: DesktopProfileRuntimeManager,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getState(profile: ProfileDescriptor | null): Promise<ProfileCloudState> {
    if (!profile?.cloudBinding) return 'UNBOUND';
    const stored = await this.sessions.load(profile.profileId);
    if (!stored || Date.parse(stored.expiresAt) <= Date.now()) return 'REAUTH_REQUIRED';

    try {
      const response = await this.fetchImpl(
        `${new URL(getApiBaseUrl()).origin}/api/auth/get-session`,
        {
          headers: { authorization: `Bearer ${stored.token}` },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (response.status === 401) return 'REAUTH_REQUIRED';
      if (!response.ok) return 'OFFLINE';
      const parsed = BetterAuthSessionResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (
        !parsed.success ||
        parsed.data.user.id !== profile.cloudBinding.cloudAccountId ||
        Date.parse(parsed.data.session.expiresAt) <= Date.now()
      )
        return 'REAUTH_REQUIRED';
      return 'ONLINE';
    } catch {
      return 'OFFLINE';
    }
  }

  async restore(profile: ProfileDescriptor): Promise<ProfileCloudState> {
    const state = await this.getState(profile);
    if (state === 'ONLINE' && this.runtime.getActiveProfileId() === profile.profileId) {
      await this.runtime.enableCloudSync({
        getAccessToken: () => this.sessions.getValidToken(profile.profileId),
      });
    }
    return state;
  }
}
