import { markProfileImportOpportunity } from './profile-import-opportunity';
import {
  CloudAuthResponseSchema,
  type CloudAuthResponse,
  type DesktopCloudConnectionRequest,
  type DesktopCloudConnectionResult,
} from '@memoflow/contracts';
import { fail, ok, type Result } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import { getApiBaseUrl } from '../utils/api-config';
import type { DesktopCloudConnectionManager } from './desktop-cloud-connection-manager';
import type { CloudSessionStore } from './cloud-session-store';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';

const logger = createLogger('DesktopCloudConnectionService');

export class DesktopCloudConnectionService {
  constructor(
    private readonly runtime: DesktopProfileRuntimeManager,
    private readonly sessions: CloudSessionStore,
    private readonly cloudChecks: Pick<DesktopCloudConnectionManager, 'runAuthentication'>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  connect(
    originProfileId: string,
    response: CloudAuthResponse,
    token: string,
    request: DesktopCloudConnectionRequest,
    signal?: AbortSignal,
  ): Promise<Result<DesktopCloudConnectionResult>> {
    const generation = this.runtime.getProfileGeneration();
    return this.runtime.runExclusive(async () => {
      try {
        // Acquire the lifecycle queue before the cloud transition, so teardown never
        // waits on an authentication operation queued behind that same teardown.
        return await this.cloudChecks.runAuthentication(
          originProfileId,
          (ownedSignal) =>
            this.connectInScope(originProfileId, generation, response, token, request, ownedSignal),
          signal,
        );
      } catch (error) {
        await this.revoke(token);
        return fail({
          code: 'PROFILE_CLOUD_CONNECTION_FAILED',
          message: error instanceof Error ? error.message : '连接云端账号失败',
        });
      }
    });
  }

  private async connectInScope(
    originProfileId: string,
    generation: number,
    response: CloudAuthResponse,
    token: string,
    request: DesktopCloudConnectionRequest,
    signal: AbortSignal,
  ): Promise<Result<DesktopCloudConnectionResult>> {
    let committed = false;
    let targetProfileId: string | null = null;
    try {
      const auth = CloudAuthResponseSchema.parse(response);
      if (!auth.session || Date.parse(auth.session.expiresAt) <= Date.now() || !token)
        throw new Error('云端认证响应无效');
      this.assertOrigin(originProfileId, generation, signal);
      if (
        request.intent === 'reauthenticate' &&
        this.runtime.getActiveProfileDescriptorSync()?.cloudBinding?.cloudAccountId !==
          auth.account.id
      ) {
        await this.revoke(token);
        return fail({
          code: 'CLOUD_IDENTITY_MISMATCH',
          message: '浏览器返回了其他账号，请使用此 Profile 原先绑定的账号重新认证',
        });
      }
      const origin = this.runtime.getActiveProfileDescriptorSync();
      const isNewTarget = !(await this.runtime.listProfiles()).some(
        (profile) => profile.cloudBinding?.cloudAccountId === auth.account.id,
      );
      const target = await this.runtime.registerCloudProfile(
        auth.account.id,
        auth.account.name || auth.account.email,
        auth.account.email,
      );
      targetProfileId = target.profileId;
      const pinRequired = await this.runtime.hasPin(targetProfileId);
      this.assertOrigin(originProfileId, generation, signal);
      // This atomic save is the commit point. A cancellation after it must not revoke the adopted session.
      await this.sessions.save(targetProfileId, {
        token,
        sessionId: auth.session.id,
        account: auth.account,
        expiresAt: auth.session.expiresAt,
      });
      committed = true;
      if (isNewTarget && request.intent === 'add_account') {
        try {
          await markProfileImportOpportunity(
            this.runtime.getSharedResolver().rootDir,
            targetProfileId,
            origin?.profileKind === 'guest' ? originProfileId : null,
          );
        } catch {
          /* Optional prompt never changes a committed login or its PIN gate. */
        }
      }
      signal.throwIfAborted();
      if (targetProfileId === originProfileId) {
        await this.runtime.enableCloudSync({
          getAccessToken: async () => {
            if (this.runtime.getActiveProfileId() !== target.profileId) return null;
            const token = await this.sessions.getValidToken(target.profileId);
            return this.runtime.getActiveProfileId() === target.profileId ? token : null;
          },
        });
        signal.throwIfAborted();
        return ok({ targetProfileId, activation: 'active' });
      }
      // The window transition disposes the old renderer before opening the target.
      return ok({ targetProfileId, activation: pinRequired ? 'pin_required' : 'pending' });
    } catch (error) {
      logger.warn('Cloud Profile connection failed', {
        originProfileId,
        targetProfileId,
        committed,
        error: error instanceof Error ? error.message : String(error),
      });
      if (committed && targetProfileId) return ok({ targetProfileId, activation: 'sync_pending' });
      await this.revoke(token);
      return fail({
        code: 'PROFILE_CLOUD_CONNECTION_FAILED',
        message: error instanceof Error ? error.message : '连接云端账号失败',
      });
    }
  }

  private assertOrigin(profileId: string, generation: number, signal?: AbortSignal): void {
    if (
      signal?.aborted ||
      this.runtime.getActiveProfileId() !== profileId ||
      this.runtime.getProfileGeneration() !== generation
    )
      throw new Error('认证已取消，或发起认证的 Profile 已锁定或切换');
  }

  async revoke(token: string): Promise<void> {
    await this.fetchImpl(`${new URL(getApiBaseUrl()).origin}/api/auth/sign-out`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
  }
}
