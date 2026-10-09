import { shell } from 'electron';
import type {
  CloudAuthResponse,
  DesktopCloudConnectionAttempt,
  DesktopCloudConnectionStatus,
} from '@memoflow/contracts';
import {
  BetterAuthSessionResponseSchema,
  type DesktopCloudConnectionRequest,
  type DesktopCloudConnectionResult,
} from '@memoflow/contracts';
import { fail, ok, type Result, type ResultError } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import { getApiBaseUrl } from '../utils/api-config';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
import type { DesktopCloudConnectionService } from './desktop-cloud-connection-service';

const logger = createLogger('DeviceAuthCoordinator');
const DESKTOP_CLIENT_ID = 'memoflow-desktop';
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface DeviceAuthErrorPayload {
  error?: string;
  error_description?: string;
  message?: string;
}

interface InternalAttempt {
  attemptId: string;
  profileId: string;
  profileGeneration: number;
  request: DesktopCloudConnectionRequest;
  result: DesktopCloudConnectionResult | null;
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresAt: number;
  pollIntervalMs: number;
  status: DesktopCloudConnectionStatus;
  error: ResultError | null;
  abortController: AbortController;
}

export interface DeviceAuthCoordinatorOptions {
  fetchImpl?: typeof fetch;
  openExternal?: (url: string) => Promise<unknown>;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

function defaultSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
  });
}

function authOrigin(): string {
  return new URL(getApiBaseUrl()).origin;
}

export class DeviceAuthCoordinator {
  private beginGeneration = 0;
  private readonly attempts = new Map<string, InternalAttempt>();
  private readonly profileAttempts = new Map<string, string>();
  private readonly fetchImpl: typeof fetch;
  private readonly openExternal: (url: string) => Promise<unknown>;
  private readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(
    private readonly runtime: DesktopProfileRuntimeManager,
    private readonly connection: DesktopCloudConnectionService,
    options: DeviceAuthCoordinatorOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.openExternal = options.openExternal ?? ((url) => shell.openExternal(url));
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  async begin(
    request: DesktopCloudConnectionRequest = { intent: 'add_account' },
  ): Promise<Result<DesktopCloudConnectionAttempt>> {
    const profileId = this.runtime.getActiveProfileId();
    if (!profileId) {
      return fail({ code: 'PROFILE_LOCKED', message: '请先打开本地 Profile' });
    }
    const generation = ++this.beginGeneration;
    const profileGeneration = this.runtime.getProfileGeneration();
    const previousAttemptId = this.profileAttempts.get(profileId);
    if (previousAttemptId) {
      this.cancelInternal(previousAttemptId);
      this.attempts.delete(previousAttemptId);
    }

    try {
      const response = await this.fetchImpl(`${authOrigin()}/api/auth/device/code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: DESKTOP_CLIENT_ID }),
        signal: AbortSignal.timeout(10_000),
      });
      const payload = (await response.json().catch(() => null)) as
        DeviceCodeResponse | DeviceAuthErrorPayload | null;
      if (!response.ok || !this.isDeviceCodeResponse(payload)) {
        return fail(
          this.toError(payload, 'CLOUD_CONNECTION_REQUEST_FAILED', '无法创建云端连接请求'),
        );
      }

      if (
        generation !== this.beginGeneration ||
        this.runtime.getProfileGeneration() !== profileGeneration ||
        this.runtime.getActiveProfileId() !== profileId
      ) {
        return fail({
          code: 'CLOUD_CONNECTION_CANCELLED',
          message: '认证请求已被替换或 Profile 已切换',
        });
      }
      const attempt: InternalAttempt = {
        attemptId: crypto.randomUUID(),
        profileId,
        profileGeneration,
        request,
        result: null,
        deviceCode: payload.device_code,
        userCode: payload.user_code,
        verificationUrl: payload.verification_uri_complete,
        expiresAt: this.now() + payload.expires_in * 1_000,
        pollIntervalMs: payload.interval * 1_000,
        status: 'awaiting_authorization',
        error: null,
        abortController: new AbortController(),
      };
      this.attempts.set(attempt.attemptId, attempt);
      this.profileAttempts.set(profileId, attempt.attemptId);

      await this.openExternal(attempt.verificationUrl).catch((error) => {
        logger.warn('Failed to open device authorization in the system browser', {
          attemptId: attempt.attemptId,
          profileId: attempt.profileId,
          error,
        });
      });
      void this.poll(attempt).catch((error) => {
        if (attempt.status === 'cancelled') return;
        attempt.deviceCode = '';
        attempt.status = 'failed';
        attempt.error = {
          code: 'CLOUD_CONNECTION_FAILED',
          message: error instanceof Error ? error.message : '云端连接失败',
        };
        logger.warn('Desktop device authorization failed', {
          attemptId: attempt.attemptId,
          profileId: attempt.profileId,
          error: attempt.error.message,
        });
      });
      return ok(this.toSnapshot(attempt));
    } catch (cause) {
      return fail({ code: 'NETWORK_ERROR', message: '无法连接认证服务器', cause });
    }
  }

  getCurrent(): Result<DesktopCloudConnectionAttempt | null> {
    const profileId = this.runtime.getActiveProfileId();
    if (!profileId) return ok(null);
    const attemptId = this.profileAttempts.get(profileId);
    const attempt = attemptId ? this.attempts.get(attemptId) : null;
    return ok(attempt ? this.toSnapshot(attempt) : null);
  }

  getStatus(attemptId: string): Result<DesktopCloudConnectionAttempt> {
    const attempt = this.getCurrentProfileAttempt(attemptId);
    return attempt
      ? ok(this.toSnapshot(attempt))
      : fail({
          code: 'CLOUD_CONNECTION_ATTEMPT_NOT_FOUND',
          message: '连接请求不存在或不属于当前 Profile',
        });
  }

  cancel(attemptId: string): Result<void> {
    const attempt = this.getCurrentProfileAttempt(attemptId);
    if (!attempt) {
      return fail({
        code: 'CLOUD_CONNECTION_ATTEMPT_NOT_FOUND',
        message: '连接请求不存在或不属于当前 Profile',
      });
    }
    this.cancelInternal(attemptId);
    return ok(undefined);
  }

  cancelForProfile(profileId: string): void {
    this.beginGeneration += 1;
    const attemptId = this.profileAttempts.get(profileId);
    if (attemptId) this.cancelInternal(attemptId);
  }

  clearForProfile(profileId: string): void {
    this.beginGeneration += 1;
    const attemptId = this.profileAttempts.get(profileId);
    if (!attemptId) return;
    this.cancelInternal(attemptId);
    this.attempts.delete(attemptId);
    this.profileAttempts.delete(profileId);
  }

  dispose(): void {
    this.beginGeneration += 1;
    for (const attemptId of this.attempts.keys()) this.cancelInternal(attemptId);
  }

  private async poll(attempt: InternalAttempt): Promise<void> {
    while (!attempt.abortController.signal.aborted && this.now() < attempt.expiresAt) {
      await this.sleep(
        Math.min(attempt.pollIntervalMs, attempt.expiresAt - this.now()),
        attempt.abortController.signal,
      );
      if (attempt.abortController.signal.aborted) return;
      if (this.now() >= attempt.expiresAt) {
        attempt.status = 'expired';
        return;
      }
      if (
        this.runtime.getActiveProfileId() !== attempt.profileId ||
        this.runtime.getProfileGeneration() !== attempt.profileGeneration
      ) {
        this.cancelInternal(attempt.attemptId);
        return;
      }

      let response: Response;
      let payload: DeviceTokenResponse | DeviceAuthErrorPayload | null;
      try {
        response = await this.fetchImpl(`${authOrigin()}/api/auth/device/token`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            grant_type: DEVICE_GRANT_TYPE,
            device_code: attempt.deviceCode,
            client_id: DESKTOP_CLIENT_ID,
          }),
          signal: AbortSignal.any([
            attempt.abortController.signal,
            AbortSignal.timeout(Math.min(10_000, Math.max(1, attempt.expiresAt - this.now()))),
          ]),
        });
        payload = (await response.json().catch(() => null)) as
          DeviceTokenResponse | DeviceAuthErrorPayload | null;
      } catch {
        this.increasePollBackoff(attempt);
        continue;
      }

      if (response.ok && this.isDeviceTokenResponse(payload)) {
        const token = payload.access_token;
        attempt.deviceCode = '';
        if (attempt.abortController.signal.aborted) {
          await this.connection.revoke(token);
          return;
        }
        attempt.status = 'connecting_profile';
        let auth: CloudAuthResponse | null;
        try {
          auth = await this.resolveAuthResponse(token, attempt.abortController.signal);
        } catch {
          await this.connection.revoke(token);
          attempt.status = attempt.abortController.signal.aborted ? 'cancelled' : 'failed';
          attempt.error = { code: 'NETWORK_ERROR', message: '无法确认新创建的云端 session' };
          return;
        }
        if (!auth) {
          await this.connection.revoke(token);
          attempt.status = 'failed';
          attempt.error = { code: 'AUTH_RESPONSE_INVALID', message: '云端认证响应无效' };
          return;
        }
        if (
          attempt.abortController.signal.aborted ||
          this.now() >= attempt.expiresAt ||
          this.runtime.getActiveProfileId() !== attempt.profileId ||
          this.runtime.getProfileGeneration() !== attempt.profileGeneration
        ) {
          await this.connection.revoke(token);
          attempt.status = this.now() >= attempt.expiresAt ? 'expired' : 'cancelled';
          return;
        }
        const connected = await this.connection.connect(
          attempt.profileId,
          auth,
          token,
          attempt.request,
          AbortSignal.any([
            attempt.abortController.signal,
            AbortSignal.timeout(Math.max(1, attempt.expiresAt - this.now())),
          ]),
        );
        if (!connected.ok) {
          attempt.status = attempt.abortController.signal.aborted ? 'cancelled' : 'failed';
          attempt.error = connected.error;
          return;
        }
        attempt.result = connected.data;
        attempt.status = 'connected';
        return;
      }

      if (response.status >= 500) {
        this.increasePollBackoff(attempt);
        continue;
      }

      const errorCode = this.readErrorCode(payload);
      if (errorCode === 'authorization_pending') continue;
      if (errorCode === 'slow_down') {
        attempt.pollIntervalMs += 5_000;
        continue;
      }
      if (errorCode === 'access_denied') {
        attempt.deviceCode = '';
        attempt.status = 'denied';
        return;
      }
      if (errorCode === 'expired_token') {
        attempt.deviceCode = '';
        attempt.status = 'expired';
        return;
      }
      attempt.deviceCode = '';
      attempt.status = 'failed';
      attempt.error = this.toError(payload, 'CLOUD_CONNECTION_FAILED', '云端连接失败');
      return;
    }
    if (attempt.status === 'awaiting_authorization') {
      attempt.deviceCode = '';
      attempt.status = 'expired';
    }
  }

  private async resolveAuthResponse(
    token: string,
    signal: AbortSignal,
  ): Promise<CloudAuthResponse | null> {
    const response = await this.fetchImpl(`${authOrigin()}/api/auth/get-session`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    });
    if (!response.ok) return null;
    const parsed = BetterAuthSessionResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) return null;
    const payload = parsed.data;
    return {
      account: {
        id: payload.user.id,
        email: payload.user.email,
        name: payload.user.name,
        emailVerified: payload.user.emailVerified === true,
      },
      session: {
        id: payload.session.id,
        expiresAt: new Date(payload.session.expiresAt).toISOString(),
      },
      requiresEmailVerification: false,
    };
  }

  private getCurrentProfileAttempt(attemptId: string): InternalAttempt | null {
    const attempt = this.attempts.get(attemptId);
    return attempt &&
      (this.runtime.getActiveProfileId() === attempt.profileId ||
        (attempt.status === 'connected' &&
          this.runtime.getActiveProfileId() === attempt.result?.targetProfileId))
      ? attempt
      : null;
  }

  private cancelInternal(attemptId: string): void {
    const attempt = this.attempts.get(attemptId);
    if (!attempt) return;
    attempt.abortController.abort();
    attempt.deviceCode = '';
    if (!['connected', 'denied', 'expired', 'failed'].includes(attempt.status)) {
      attempt.status = 'cancelled';
    }
  }

  private increasePollBackoff(attempt: InternalAttempt): void {
    const backoff = attempt.pollIntervalMs * 2;
    const jitter = Math.round(backoff * this.random() * 0.2);
    attempt.pollIntervalMs = Math.min(backoff + jitter, 30_000);
  }

  private toSnapshot(attempt: InternalAttempt): DesktopCloudConnectionAttempt {
    return {
      attemptId: attempt.attemptId,
      originProfileId: attempt.profileId,
      result: attempt.result,
      userCode: attempt.userCode,
      verificationUrl: attempt.verificationUrl,
      expiresAt: new Date(attempt.expiresAt).toISOString(),
      status: attempt.status,
      error: attempt.error ? { code: attempt.error.code, message: attempt.error.message } : null,
    };
  }

  private isDeviceCodeResponse(payload: unknown): payload is DeviceCodeResponse {
    if (!payload || typeof payload !== 'object') return false;
    const record = payload as Record<string, unknown>;
    return (
      typeof record.device_code === 'string' &&
      typeof record.user_code === 'string' &&
      typeof record.verification_uri_complete === 'string' &&
      typeof record.expires_in === 'number' &&
      typeof record.interval === 'number'
    );
  }

  private isDeviceTokenResponse(payload: unknown): payload is DeviceTokenResponse {
    if (!payload || typeof payload !== 'object') return false;
    const record = payload as Record<string, unknown>;
    return typeof record.access_token === 'string' && record.token_type === 'Bearer';
  }

  private readErrorCode(
    payload: DeviceAuthErrorPayload | DeviceTokenResponse | null,
  ): string | null {
    return payload && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : null;
  }

  private toError(
    payload: DeviceAuthErrorPayload | DeviceCodeResponse | DeviceTokenResponse | null,
    fallbackCode: string,
    fallbackMessage: string,
  ): ResultError {
    const error = payload && 'error' in payload ? payload.error : undefined;
    const description =
      payload && 'error_description' in payload ? payload.error_description : undefined;
    const message = payload && 'message' in payload ? payload.message : undefined;
    return {
      code: typeof error === 'string' ? error.toUpperCase() : fallbackCode,
      message:
        typeof description === 'string'
          ? description
          : typeof message === 'string'
            ? message
            : fallbackMessage,
    };
  }
}
