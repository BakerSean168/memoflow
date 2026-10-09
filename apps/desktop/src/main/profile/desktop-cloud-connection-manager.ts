import { BetterAuthSessionResponseSchema } from '@memoflow/contracts';
import type { ProfileCloudState } from '@memoflow/contracts/electron';
import { getApiBaseUrl } from '../utils/api-config';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
import type { ProfileDescriptor } from './profile-registry';
import type { CloudSessionStore, StoredCloudSession } from './cloud-session-store';

const SESSION_CHECK_TIMEOUT_MS = 5_000;
interface CloudCheck {
  profileId: string;
  accountId: string;
  controller: AbortController;
  token: string | null;
  state: ProfileCloudState;
  task: Promise<ProfileCloudState> | null;
}

export class DesktopCloudConnectionManager {
  private current: CloudCheck | null = null;
  private authentication: {
    profileId: string;
    controller: AbortController;
    task: Promise<unknown> | null;
  } | null = null;
  private readonly clearingSessions = new Map<string, Promise<StoredCloudSession | null>>();

  constructor(
    private readonly sessions: CloudSessionStore,
    private readonly runtime: DesktopProfileRuntimeManager,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** The local shell never waits for a network check to learn that it is unlocked. */
  async getState(profile: ProfileDescriptor | null): Promise<ProfileCloudState> {
    if (!profile?.cloudBinding) return 'UNBOUND';
    const stored = await this.sessions.load(profile.profileId);
    if (this.clearingSessions.has(profile.profileId)) return 'REAUTH_REQUIRED';
    if (!this.isValidLocalSession(stored, profile.cloudBinding.cloudAccountId))
      return 'REAUTH_REQUIRED';
    const current = this.current;
    return current &&
      this.isCurrent(current) &&
      current.profileId === profile.profileId &&
      current.token === stored.token
      ? current.state
      : 'CHECKING';
  }

  restore(profile: ProfileDescriptor): Promise<ProfileCloudState> {
    if (!profile.cloudBinding) return Promise.resolve('UNBOUND');
    if (this.clearingSessions.has(profile.profileId)) return Promise.resolve('REAUTH_REQUIRED');
    if (this.authentication?.task) {
      return this.authentication.task.catch(() => undefined).then(() => this.restore(profile));
    }
    const accountId = profile.cloudBinding.cloudAccountId;
    const active = this.runtime.getActiveProfileDescriptorSync();
    if (
      active?.profileId !== profile.profileId ||
      active.cloudBinding?.cloudAccountId !== accountId
    ) {
      return Promise.resolve('OFFLINE');
    }
    const existing = this.current;
    const sameProfile =
      existing?.profileId === profile.profileId && existing.accountId === accountId;
    if (sameProfile && existing.task) return existing.task;
    if (!sameProfile) existing?.controller.abort();
    const check: CloudCheck = sameProfile
      ? existing
      : {
          profileId: profile.profileId,
          accountId,
          controller: new AbortController(),
          token: null,
          state: 'CHECKING',
          task: null,
        };
    this.current = check;
    check.task = this.checkAndConnect(check).finally(() => {
      check.task = null;
    });
    return check.task;
  }

  async cancel(): Promise<void> {
    const authentication = this.authentication;
    authentication?.controller.abort();
    await this.stopBackgroundCheck();
    // Session replacement and background refresh are both drained before removal.
    await authentication?.task?.catch(() => undefined);
  }

  private async stopBackgroundCheck(): Promise<void> {
    const check = this.current;
    this.current = null;
    check?.controller.abort();
    // The SDK connect promise may only settle after disconnect aborts its loop.
    const stopping = this.runtime.disableCloudSync();
    await Promise.all([stopping, check?.task]);
  }

  async runAuthentication<T>(
    profileId: string,
    operation: (signal: AbortSignal) => Promise<T>,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    if (this.authentication || this.clearingSessions.has(profileId)) {
      throw new Error('A cloud session transition is already in progress');
    }
    callerSignal?.throwIfAborted();
    const authentication = {
      profileId,
      controller: new AbortController(),
      task: null as Promise<unknown> | null,
    };
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, authentication.controller.signal])
      : authentication.controller.signal;
    this.authentication = authentication;
    let cancellation: Promise<void> | null = null;
    const stopPendingSync = () => {
      cancellation = this.runtime.disableCloudSync();
      void cancellation.catch(() => undefined);
    };
    signal.addEventListener('abort', stopPendingSync, { once: true });
    const task = (async () => {
      await this.stopBackgroundCheck();
      signal.throwIfAborted();
      if (this.runtime.getActiveProfileDescriptorSync()?.profileId !== profileId) {
        throw new Error('The authenticating Profile is no longer active');
      }
      return operation(signal);
    })().finally(async () => {
      signal.removeEventListener('abort', stopPendingSync);
      try {
        await cancellation;
      } finally {
        if (this.authentication === authentication) this.authentication = null;
      }
    });
    authentication.task = task;
    return task;
  }

  clearSession(profileId: string): Promise<StoredCloudSession | null> {
    const existing = this.clearingSessions.get(profileId);
    if (existing) return existing;
    const pending = (async () => {
      if (
        this.runtime.getActiveProfileDescriptorSync()?.profileId === profileId ||
        this.current?.profileId === profileId ||
        this.authentication?.profileId === profileId
      )
        await this.cancel();
      const stored = await this.sessions.load(profileId);
      await this.sessions.remove(profileId);
      return stored;
    })().finally(() => {
      this.clearingSessions.delete(profileId);
    });
    this.clearingSessions.set(profileId, pending);
    return pending;
  }

  private isValidLocalSession(
    stored: StoredCloudSession | null,
    accountId: string,
  ): stored is StoredCloudSession {
    return (
      stored !== null &&
      stored.account.id === accountId &&
      Number.isFinite(Date.parse(stored.expiresAt)) &&
      Date.parse(stored.expiresAt) > Date.now()
    );
  }

  private isCurrent(check: CloudCheck): boolean {
    const active = this.runtime.getActiveProfileDescriptorSync();
    return (
      this.current === check &&
      !this.clearingSessions.has(check.profileId) &&
      !check.controller.signal.aborted &&
      active?.profileId === check.profileId &&
      active.cloudBinding?.cloudAccountId === check.accountId
    );
  }

  private async checkAndConnect(check: CloudCheck): Promise<ProfileCloudState> {
    let state: ProfileCloudState = 'OFFLINE';
    try {
      const stored = await this.sessions.load(check.profileId);
      if (!this.isCurrent(check)) return 'OFFLINE';
      if (!this.isValidLocalSession(stored, check.accountId)) {
        state = 'REAUTH_REQUIRED';
      } else {
        check.token = stored.token;
        const remote = await this.checkRemoteSession(check, stored.token);
        if (!this.isCurrent(check)) return 'OFFLINE';
        if (typeof remote === 'string') {
          state = remote;
        } else {
          await this.sessions.save(check.profileId, remote);
          if (!this.isCurrent(check)) return 'OFFLINE';
          await this.runtime.enableCloudSync({
            getAccessToken: async () => {
              if (!this.isCurrent(check)) return null;
              const token = await this.sessions.getValidToken(check.profileId);
              return this.isCurrent(check) ? token : null;
            },
          });
          state = 'ONLINE';
        }
      }
    } catch {
      state = 'OFFLINE';
    }
    if (!this.isCurrent(check)) return 'OFFLINE';
    check.state = state;
    return state;
  }

  private async checkRemoteSession(
    check: CloudCheck,
    token: string,
  ): Promise<StoredCloudSession | 'OFFLINE' | 'REAUTH_REQUIRED'> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), SESSION_CHECK_TIMEOUT_MS);
    const signal = AbortSignal.any([check.controller.signal, timeout.signal]);
    let rejectAborted: () => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAborted = () => reject(new Error('Cloud session check cancelled or timed out'));
      signal.addEventListener('abort', rejectAborted, { once: true });
      if (signal.aborted) rejectAborted();
    });
    // Persistence stays outside the raced request: a late response has no side effects.
    const request = async (): Promise<StoredCloudSession | 'OFFLINE' | 'REAUTH_REQUIRED'> => {
      const response = await this.fetchImpl(
        `${new URL(getApiBaseUrl()).origin}/api/auth/get-session`,
        {
          headers: { authorization: `Bearer ${token}` },
          signal,
        },
      );
      if (response.status === 401) return 'REAUTH_REQUIRED';
      if (!response.ok) return 'OFFLINE';
      const parsed = BetterAuthSessionResponseSchema.safeParse(await response.json());
      if (
        !parsed.success ||
        parsed.data.user.id !== check.accountId ||
        Date.parse(parsed.data.session.expiresAt) <= Date.now()
      ) {
        return 'REAUTH_REQUIRED';
      }
      return {
        token,
        sessionId: parsed.data.session.id,
        account: { ...parsed.data.user, emailVerified: parsed.data.user.emailVerified === true },
        expiresAt: parsed.data.session.expiresAt,
      };
    };
    try {
      return await Promise.race([request(), aborted]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', rejectAborted);
    }
  }
}
