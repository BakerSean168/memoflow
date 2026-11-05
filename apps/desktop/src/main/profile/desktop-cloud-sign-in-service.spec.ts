import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopCloudSignInService } from './desktop-cloud-sign-in-service';

vi.mock('../utils/api-config', () => ({
  getApiBaseUrl: () => 'https://api.memo.test/api/v1',
}));

const dataRoots: string[] = [];

afterEach(() => {
  for (const root of dataRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const cloudProfileId = 'p_0123456789abcdef01234567';

const signedInUser = {
  id: 'account-1',
  email: 'person@example.com',
  name: 'Person',
  emailVerified: true,
};

const sessionResponse = {
  user: signedInUser,
  session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
};

interface SetupOptions {
  profileId?: string;
  profiles?: Array<{ profileId: string; cloudBinding?: { cloudAccountId: string } }>;
}

function setup(fetchImpl: ReturnType<typeof vi.fn>, options: SetupOptions = {}) {
  const dataRoot = mkdtempSync(path.join(tmpdir(), 'cloud-sign-in-'));
  dataRoots.push(dataRoot);
  const profileId = options.profileId ?? cloudProfileId;
  const runtime = {
    registerCloudProfile: vi.fn().mockResolvedValue({ profileId }),
    listProfiles: vi.fn().mockResolvedValue(options.profiles ?? []),
    getSharedResolver: () => ({ roots: { dataRoot } }),
    openProfile: vi.fn().mockResolvedValue({}),
  };
  const sessions = {
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const service = new DesktopCloudSignInService(runtime as never, sessions as never, {
    fetchImpl: fetchImpl as unknown as typeof fetch,
    openExternal: vi.fn().mockResolvedValue(undefined),
  });
  return { service, runtime, sessions, dataRoot, profileId };
}

function importMarkerPath(dataRoot: string, profileId: string) {
  return path.join(dataRoot, 'shared', 'profiles', 'import-prompts', `${profileId}.json`);
}

describe('DesktopCloudSignInService', () => {
  it('signs in, registers or finds the Profile and persists the session when remembered', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ token: 'bearer-token', user: signedInUser }))
      .mockResolvedValueOnce(json(sessionResponse));
    const { service, runtime, sessions } = setup(fetchImpl);

    const result = await service.signIn({
      email: 'person@example.com',
      password: 'cloud-password',
      remember: true,
    });

    expect(result).toEqual({ ok: true, data: { profileId: cloudProfileId } });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://api.memo.test/api/auth/sign-in/email',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://api.memo.test' },
      }),
    );
    expect(runtime.registerCloudProfile).toHaveBeenCalledWith(
      'account-1',
      'Person',
      'person@example.com',
    );
    expect(sessions.save).toHaveBeenCalledWith(
      cloudProfileId,
      expect.objectContaining({ token: 'bearer-token', sessionId: 'session-1' }),
      { persist: true },
    );
    expect(runtime.openProfile).toHaveBeenCalledWith(cloudProfileId);
  });

  it('leaves an import invitation for a newly adopted cloud Profile', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ token: 'bearer-token', user: signedInUser }))
      .mockResolvedValueOnce(json(sessionResponse));
    const { service, dataRoot } = setup(fetchImpl, { profileId: cloudProfileId });

    const result = await service.signIn({
      email: 'person@example.com',
      password: 'cloud-password',
      remember: true,
    });

    expect(result).toEqual({ ok: true, data: { profileId: cloudProfileId } });
    const marker = importMarkerPath(dataRoot, cloudProfileId);
    expect(existsSync(marker)).toBe(true);
    expect(JSON.parse(readFileSync(marker, 'utf8'))).toEqual({
      sourceProfileId: null,
      consumed: false,
    });
  });

  it('does not invite an import when the cloud account already has a Profile', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ token: 'bearer-token', user: signedInUser }))
      .mockResolvedValueOnce(json(sessionResponse));
    const { service, dataRoot } = setup(fetchImpl, {
      profileId: cloudProfileId,
      profiles: [{ profileId: cloudProfileId, cloudBinding: { cloudAccountId: signedInUser.id } }],
    });

    await service.signIn({
      email: 'person@example.com',
      password: 'cloud-password',
      remember: true,
    });

    expect(existsSync(importMarkerPath(dataRoot, cloudProfileId))).toBe(false);
  });

  it('keeps the session in process memory only when "remember me" is off', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ token: 'bearer-token', user: signedInUser }))
      .mockResolvedValueOnce(json(sessionResponse));
    const { service, sessions } = setup(fetchImpl);

    await service.signIn({
      email: 'person@example.com',
      password: 'cloud-password',
      remember: false,
    });

    expect(sessions.save).toHaveBeenCalledWith(
      cloudProfileId,
      expect.objectContaining({ token: 'bearer-token' }),
      { persist: false },
    );
  });

  it('maps a rejected credential to UNAUTHORIZED without registering a Profile', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ code: 'INVALID_EMAIL_OR_PASSWORD' }, 401));
    const { service, runtime, sessions } = setup(fetchImpl);

    const result = await service.signIn({
      email: 'person@example.com',
      password: 'wrong-password',
      remember: true,
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(runtime.registerCloudProfile).not.toHaveBeenCalled();
    expect(sessions.save).not.toHaveBeenCalled();
  });

  it('surfaces a network failure instead of a fake success', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed'));
    const { service, runtime } = setup(fetchImpl);

    const result = await service.signIn({
      email: 'person@example.com',
      password: 'cloud-password',
      remember: true,
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'NETWORK_ERROR' } });
    expect(runtime.openProfile).not.toHaveBeenCalled();
  });

  it('requires email verification when sign-up issues no session token', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ token: null, user: signedInUser }));
    const { service, runtime } = setup(fetchImpl);

    const result = await service.signUp({
      email: 'person@example.com',
      password: 'cloud-password',
      remember: true,
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'EMAIL_VERIFICATION_REQUIRED' } });
    expect(runtime.registerCloudProfile).not.toHaveBeenCalled();
  });

  it('rolls the session back when "remember me" cannot be written', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ token: 'bearer-token', user: signedInUser }))
      .mockResolvedValueOnce(json(sessionResponse))
      .mockResolvedValueOnce(json({}));
    const { service, runtime, sessions } = setup(fetchImpl);
    sessions.save.mockRejectedValueOnce(new Error('本机安全存储不可用'));

    const result = await service.signIn({
      email: 'person@example.com',
      password: 'cloud-password',
      remember: true,
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'SESSION_PERSIST_FAILED' } });
    expect(sessions.remove).toHaveBeenCalledWith(cloudProfileId);
    expect(runtime.openProfile).not.toHaveBeenCalled();
  });
});
