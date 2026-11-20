import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalAgentChannels } from '@memoflow/desktop-contracts';
import { registerExternalAgentIpc } from './external-agent-ipc';

vi.mock('../utils/api-config', () => ({
  getApiBaseUrl: () => 'https://api.memo.test/api/v1',
  getWebAppUrl: () => 'https://memo.test',
}));

type Handler = (
  _event: unknown,
  input?: unknown,
) => Promise<{
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; failure?: { code: string } };
}>;

const profileId = 'profile-1';
const patId = '5b5d8a2b-9934-4be8-8e07-3f62ed122e15';
const summary = {
  id: patId,
  name: 'desktop agent',
  prefix: 'mfp_Desktop',
  audience: 'https://api.memo.test/mcp',
  scopes: ['goals:read'],
  createdAt: '2026-11-18T00:00:00.000Z',
  expiresAt: '2027-02-16T00:00:00.000Z',
  revokedAt: null,
  lastUsedAt: null,
};

function registerFixture(
  options: { profileKind?: 'local' | 'registered'; token?: string | null } = {},
) {
  const handlers = new Map<string, Handler>();
  vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
    handlers.set(channel, handler as unknown as Handler);
    return undefined as never;
  });
  const runtime = {
    getActiveProfileDescriptorSync: vi.fn(() => ({
      profileId,
      profileKind: options.profileKind ?? 'registered',
      cloudBinding: { cloudAccountId: 'account-1' },
    })),
  };
  const sessions = {
    getValidToken: vi
      .fn()
      .mockResolvedValue(options.token === undefined ? 'session-token' : options.token),
  };
  registerExternalAgentIpc({
    runtime: runtime as never,
    sessions: sessions as never,
  });
  const call = (channel: string, input?: unknown) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`handler ${channel} is not registered`);
    return handler({}, input);
  };
  return { handlers, runtime, sessions, call };
}

function stubFetch(response: Response) {
  const fetcher = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('registerExternalAgentIpc (#1030)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('registers exactly the connection management channels', () => {
    const { handlers } = registerFixture();
    expect([...handlers.keys()].sort()).toEqual([...Object.values(ExternalAgentChannels)].sort());
  });

  it('forwards the active cloud session as a bearer credential', async () => {
    const fetcher = stubFetch(new Response(JSON.stringify({ data: [summary] }), { status: 200 }));
    const { call, sessions } = registerFixture();

    expect(await call(ExternalAgentChannels.LIST_PATS)).toMatchObject({
      ok: true,
      data: [summary],
    });
    expect(sessions.getValidToken).toHaveBeenCalledWith(profileId);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.memo.test/api/v1/agent-connections/pats');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer session-token',
      origin: 'https://memo.test',
    });
  });

  it('creates a PAT and returns the one-time secret without exposing the session token', async () => {
    const fetcher = stubFetch(
      new Response(JSON.stringify({ data: { ...summary, secret: 'mfp_once', replayed: false } }), {
        status: 201,
      }),
    );
    const { call } = registerFixture();

    const result = await call(ExternalAgentChannels.CREATE_PAT, {
      name: 'desktop agent',
      expiresInDays: 90,
      scopes: ['goals:read'],
      idempotencyKey: 'desktop-1',
    });

    expect(result).toMatchObject({ ok: true, data: { secret: 'mfp_once' } });
    expect(JSON.stringify(result)).not.toContain('session-token');
    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer session-token',
      origin: 'https://memo.test',
      'idempotency-key': 'desktop-1',
    });
  });

  it('revokes a PAT through the bearer transport', async () => {
    const fetcher = stubFetch(new Response(null, { status: 204 }));
    const { call } = registerFixture();

    expect(await call(ExternalAgentChannels.REVOKE_PAT, patId)).toMatchObject({ ok: true });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.memo.test/api/v1/agent-connections/pats/${patId}`);
    expect(init.method).toBe('DELETE');
  });

  it('hides connection management for a local-only Profile', async () => {
    const fetcher = stubFetch(new Response('{}', { status: 200 }));
    const { call } = registerFixture({ profileKind: 'local' });

    expect(await call(ExternalAgentChannels.CAPABILITIES)).toMatchObject({
      ok: false,
      error: { code: 'EAG_SERVICE_DISABLED' },
    });
    expect(await call(ExternalAgentChannels.LIST_PATS)).toMatchObject({
      ok: false,
      error: { code: 'EAG_UNAUTHORIZED' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports an expired or missing cloud session without calling the API', async () => {
    const fetcher = stubFetch(new Response('{}', { status: 200 }));
    const { call } = registerFixture({ token: null });

    expect(await call(ExternalAgentChannels.CAPABILITIES)).toMatchObject({
      ok: false,
      error: { code: 'EAG_UNAUTHORIZED' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('validates renderer input before forwarding it', async () => {
    const fetcher = stubFetch(new Response('{}', { status: 200 }));
    const { call } = registerFixture();

    expect(
      await call(ExternalAgentChannels.CREATE_PAT, { name: '', scopes: ['goals:read'] }),
    ).toMatchObject({ ok: false, error: { code: 'EAG_VALIDATION_ERROR' } });
    expect(await call(ExternalAgentChannels.REVOKE_PAT, 'not-a-uuid')).toMatchObject({
      ok: false,
      error: { code: 'EAG_VALIDATION_ERROR' },
    });
    expect(await call(ExternalAgentChannels.REVOKE_CONNECTION, 'nope')).toMatchObject({
      ok: false,
      error: { code: 'EAG_VALIDATION_ERROR' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('carries the typed public failure across IPC for rejected requests', async () => {
    stubFetch(new Response(JSON.stringify({ message: 'private' }), { status: 403 }));
    const { call } = registerFixture();

    const result = await call(ExternalAgentChannels.LIST_PATS);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'EAG_FORBIDDEN', failure: { code: 'EAG_FORBIDDEN' } },
    });
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('maps a network failure to a retryable public failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const { call } = registerFixture();

    expect(await call(ExternalAgentChannels.LIST_CONNECTIONS)).toMatchObject({
      ok: false,
      error: { code: 'EAG_NETWORK_ERROR' },
    });
  });
});
