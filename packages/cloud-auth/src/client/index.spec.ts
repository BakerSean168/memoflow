import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudAuthChannels } from '@memoflow/contracts/electron';
import { createCloudAuthHttpClient, createCloudAuthIpcClient } from './index';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CloudAuthHttpClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('restores the real Better Auth session after email sign-in', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          token: 'bearer-token',
          user: { id: 'user-1', email: 'user@example.com', name: 'User', emailVerified: true },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          user: { id: 'user-1', email: 'user@example.com', name: 'User', emailVerified: true },
          session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createCloudAuthHttpClient(undefined, {
      baseUrl: 'https://memo.test',
    }).signIn({ email: 'user@example.com', password: 'secret-password' });

    expect(result).toEqual({
      ok: true,
      data: {
        account: { id: 'user-1', email: 'user@example.com', name: 'User', emailVerified: true },
        session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
        requiresEmailVerification: false,
      },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://memo.test/api/auth/get-session',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
  });

  it('returns verification-required registration without inventing a session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          token: null,
          user: { id: 'user-2', email: 'new@example.com', name: 'New', emailVerified: false },
        }),
      ),
    );

    const result = await createCloudAuthHttpClient(undefined, {
      baseUrl: 'https://memo.test',
    }).signUp({ email: 'new@example.com', password: 'secret-password', name: 'New' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.session).toBeNull();
    expect(result.data.requiresEmailVerification).toBe(true);
  });

  it('maps unauthorized and network failures without exposing transport details', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'Invalid password' }, 401))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const client = createCloudAuthHttpClient(undefined, { baseUrl: 'https://memo.test' });

    await expect(
      client.signIn({ email: 'user@example.com', password: 'bad-password' }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
    });
    await expect(client.getSession()).resolves.toMatchObject({
      ok: false,
      error: { code: 'NETWORK_ERROR' },
    });
  });

  it.each([
    {
      status: 401,
      providerCode: 'INVALID_EMAIL_OR_PASSWORD',
      providerMessage: 'Invalid email or password',
      expectedCode: 'UNAUTHORIZED',
      expectedMessage: 'Invalid credentials',
    },
    {
      status: 403,
      providerCode: 'EMAIL_NOT_VERIFIED',
      providerMessage: 'Email not verified',
      expectedCode: 'EMAIL_VERIFICATION_REQUIRED',
      expectedMessage: 'Email verification required',
    },
    {
      status: 422,
      providerCode: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
      providerMessage: 'User already exists. Please use another email.',
      expectedCode: 'USER_ALREADY_EXISTS',
      expectedMessage: 'Account already exists',
    },
  ])(
    'projects Better Auth $providerCode into MemoFlow $expectedCode',
    async ({ status, providerCode, providerMessage, expectedCode, expectedMessage }) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ code: providerCode, message: providerMessage }, status),
          ),
      );

      const result = await createCloudAuthHttpClient(undefined, {
        baseUrl: 'https://memo.test',
      }).signIn({ email: 'user@example.com', password: 'wrong-or-unverified' });

      expect(result).toMatchObject({
        ok: false,
        error: { code: expectedCode, message: expectedMessage },
      });
      expect(result).not.toHaveProperty('data.requiresEmailVerification');
      expect(JSON.stringify(result)).not.toContain(providerCode);
      expect(JSON.stringify(result)).not.toContain(providerMessage);
    },
  );

  it('claims and approves a device authorization through the Web cookie session', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ user_code: 'ABCD1234', status: 'pending' }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createCloudAuthHttpClient(undefined, { baseUrl: 'https://memo.test' });

    await expect(client.getDeviceAuthorization('ABCD-1234')).resolves.toEqual({
      ok: true,
      data: { userCode: 'ABCD1234', status: 'pending' },
    });
    await expect(client.approveDeviceAuthorization('ABCD1234')).resolves.toMatchObject({
      ok: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://memo.test/api/auth/device?user_code=ABCD-1234',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://memo.test/api/auth/device/approve',
      expect.objectContaining({ body: JSON.stringify({ userCode: 'ABCD1234' }) }),
    );
  });
});

describe('CloudAuthIpcClient', () => {
  it('uses the provider-neutral Desktop cloud connection channels', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const client = createCloudAuthIpcClient({ invoke } as never);

    await client.beginCloudConnection();
    await client.getCurrentCloudConnection();
    await client.getCloudConnectionStatus('attempt-1');
    await client.cancelCloudConnection('attempt-1');

    expect(invoke).toHaveBeenNthCalledWith(1, CloudAuthChannels.CLOUD_CONNECTION_BEGIN);
    expect(invoke).toHaveBeenNthCalledWith(2, CloudAuthChannels.CLOUD_CONNECTION_CURRENT);
    expect(invoke).toHaveBeenNthCalledWith(3, CloudAuthChannels.CLOUD_CONNECTION_STATUS, {
      attemptId: 'attempt-1',
    });
    expect(invoke).toHaveBeenNthCalledWith(4, CloudAuthChannels.CLOUD_CONNECTION_CANCEL, {
      attemptId: 'attempt-1',
    });
  });
});
