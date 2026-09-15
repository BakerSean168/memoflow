import type { AccountClientDTO, UpdateAccountReq } from '@memoflow/contracts/account';
import type { CloudAuthResponse } from '@memoflow/contracts';
import { fail, ok, type Result, ResultErrorException } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import { getApiBaseUrl } from '../utils/api-config';
import type { CloudSessionStore } from './cloud-session-store';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';

interface AccountHttpResponse {
  ok: boolean;
  data?: AccountClientDTO;
  error?: { message?: string };
}

const logger = createLogger('DesktopCloudConnectionService');

export class DesktopCloudConnectionService {
  constructor(
    private readonly runtime: DesktopProfileRuntimeManager,
    private readonly sessions: CloudSessionStore,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async connect(
    profileId: string,
    auth: CloudAuthResponse,
    token: string,
  ): Promise<Result<CloudAuthResponse>> {
    if (!auth.session) {
      return fail({ code: 'AUTH_RESPONSE_INVALID', message: '云端认证响应缺少 session' });
    }
    let phase = 'profile_assertion';
    let profileBound = false;
    let sessionPersisted = false;
    try {
      this.assertTargetProfile(profileId);
      phase = 'profile_reconciliation';
      await this.reconcileLocalProfileToCloud(token, auth.account.email);
      phase = 'profile_binding';
      this.assertTargetProfile(profileId);
      await this.runtime.bindCurrentProfile(auth.account.id, auth.account.name, auth.account.email);
      profileBound = true;
      phase = 'session_persistence';
      await this.sessions.save(profileId, {
        token,
        sessionId: auth.session.id,
        account: auth.account,
        expiresAt: auth.session.expiresAt,
      });
      sessionPersisted = true;
      phase = 'sync_enablement';
      await this.runtime.enableCloudSync({
        getAccessToken: () => this.sessions.getValidToken(profileId),
      });
      return ok(auth);
    } catch (error) {
      logger.warn('Desktop cloud connection failed', {
        profileId,
        phase,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!profileBound) {
        await this.revoke(token);
      } else if (!sessionPersisted) {
        await Promise.allSettled([this.sessions.remove(profileId), this.revoke(token)]);
        return fail({
          code: 'PROFILE_CLOUD_REAUTH_REQUIRED',
          message: '本地 Profile 已连接该账号，但无法安全保存云端会话，请重新认证',
        });
      } else {
        return fail({
          code: 'PROFILE_CLOUD_SYNC_FAILED',
          message: '云端账号已连接，但同步暂未启动；本地数据仍可正常使用',
        });
      }
      return fail({
        code: 'PROFILE_CLOUD_CONNECTION_FAILED',
        message: error instanceof Error ? error.message : '连接云端账号失败',
      });
    }
  }

  private assertTargetProfile(profileId: string): void {
    if (this.runtime.getActiveProfileId() !== profileId) {
      throw new Error('发起认证的本地 Profile 已锁定或切换');
    }
  }

  private async reconcileLocalProfileToCloud(token: string, email: string): Promise<void> {
    const local = await this.runtime.getCurrentLocalAccount();
    const response = await this.fetchImpl(`${getApiBaseUrl()}/accounts/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const envelope = (await response.json().catch(() => null)) as AccountHttpResponse | null;
    if (!response.ok || !envelope?.ok || !envelope.data) {
      throw new ResultErrorException(
        '无法读取云端账户资料',
        'REMOTE_PROFILE_READ_FAILED',
        undefined,
        undefined,
        undefined,
        envelope?.error,
      );
    }

    const cloud = envelope.data;
    const emailDefaultNickname = email.split('@')[0].slice(0, 10);
    const patch: UpdateAccountReq = {};
    if (!cloud.profile.nickname || cloud.profile.nickname === emailDefaultNickname) {
      patch.nickname = local.profile.nickname;
    }
    if (!cloud.profile.avatarUrl && local.profile.avatarUrl) patch.avatar = local.profile.avatarUrl;
    if (!cloud.profile.bio && local.profile.bio) patch.bio = local.profile.bio;
    if (Object.keys(patch).length === 0) return;

    const updateResponse = await this.fetchImpl(`${getApiBaseUrl()}/accounts/me`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(patch),
    });
    const updated = (await updateResponse.json().catch(() => null)) as AccountHttpResponse | null;
    if (!updateResponse.ok || !updated?.ok) {
      throw new ResultErrorException(
        '无法初始化云端账户资料',
        'REMOTE_PROFILE_UPDATE_FAILED',
        undefined,
        undefined,
        undefined,
        updated?.error,
      );
    }
  }

  async revoke(token: string): Promise<void> {
    await this.fetchImpl(`${new URL(getApiBaseUrl()).origin}/api/auth/sign-out`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    }).catch(() => undefined);
  }
}
