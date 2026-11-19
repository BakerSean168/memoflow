/**
 * Desktop connection management end-to-end at the process boundary (Issue #1030).
 *
 * Runs the real main-process handlers, the real Result IPC client and the real
 * renderer client over a stubbed cloud HTTP server. The shared settings section
 * is unchanged from Web; this spec proves the desktop transport delivers the
 * same list/create/revoke behavior.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExternalAgentIpcClient } from '@memoflow/cloud-auth';
import { createResultIpcClient } from '@memoflow/ipc-client';
import { registerExternalAgentIpc } from '../../main/profile/external-agent-ipc';

vi.mock('../../main/utils/api-config', () => ({
  getApiBaseUrl: () => 'https://api.memo.test/api/v1',
  getWebAppUrl: () => 'https://memo.test',
}));

const existing = {
  id: '5b5d8a2b-9934-4be8-8e07-3f62ed122e15',
  name: 'web agent',
  prefix: 'mfp_Web',
  audience: 'https://api.memo.test/mcp',
  scopes: ['goals:read'],
  createdAt: '2026-11-18T00:00:00.000Z',
  expiresAt: '2027-02-16T00:00:00.000Z',
  revokedAt: null,
};
const createdId = '15d9a2d0-51be-4e31-9d4b-14b0a92b5e11';

type RequestRecord = { url: string; init: RequestInit };

/** Minimal `/api/v1/agent-connections` server: stateful list/create/revoke. */
function startCloudStub() {
  let pats = [existing];
  const requests: RequestRecord[] = [];
  const subject = {
    get pats() {
      return pats;
    },
    requests,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      requests.push({ url, init });
      const method = init.method ?? 'GET';
      if (url.endsWith('/agent-connections/capabilities'))
        return new Response(JSON.stringify({ oauth: false }), { status: 200 });
      if (url.endsWith('/agent-connections/pats') && method === 'GET')
        return new Response(JSON.stringify({ data: pats }), { status: 200 });
      if (url.endsWith('/agent-connections/pats') && method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          name: string;
          scopes: string[];
          expiresInDays: number;
        };
        const pat = {
          ...existing,
          id: createdId,
          name: body.name,
          prefix: 'mfp_New',
          scopes: body.scopes,
        };
        pats = [...pats, pat];
        return new Response(
          JSON.stringify({ data: { ...pat, secret: 'mfp_once', replayed: false } }),
          { status: 201 },
        );
      }
      const revoke = /\/agent-connections\/(pats|oauth)\/([0-9a-f-]{36})$/u.exec(url);
      if (revoke && method === 'DELETE') {
        pats = pats.filter((pat) => pat.id !== revoke[2]);
        return new Response(null, { status: 204 });
      }
      return new Response('{}', { status: 404 });
    }),
  );
  return subject;
}

function registerDesktopRuntime() {
  const handlers = new Map<string, (event: unknown, input?: unknown) => Promise<unknown>>();
  vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
    handlers.set(channel, handler as never);
    return undefined as never;
  });
  registerExternalAgentIpc({
    runtime: {
      getActiveProfileDescriptorSync: () => ({
        profileId: 'profile-1',
        profileKind: 'registered',
      }),
    } as never,
    sessions: { getValidToken: async () => 'session-token' } as never,
  });
  const ipc = createResultIpcClient({
    bridge: {
      invoke: (channel: string, ...args: unknown[]) => {
        const handler = handlers.get(channel);
        if (!handler) return Promise.reject(new Error(`no handler for ${channel}`));
        return handler({}, ...args);
      },
      on: () => undefined,
      off: () => undefined,
    },
    enableLogging: false,
  });
  return createExternalAgentIpcClient(ipc);
}

describe('desktop external agent connections (#1030)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('lists, creates and revokes PATs for the signed-in cloud account', async () => {
    const cloud = startCloudStub();
    const client = registerDesktopRuntime();

    expect(await client.capabilities()).toEqual({ ok: true, data: { oauth: false } });
    expect(await client.listPats()).toEqual({ ok: true, data: [existing] });

    const created = await client.createPat({
      name: 'desktop agent',
      expiresInDays: 90,
      scopes: ['goals:read', 'goals:write'],
      idempotencyKey: 'desktop-intent-1',
    });
    expect(created).toMatchObject({
      ok: true,
      data: { id: createdId, scopes: ['goals:read', 'goals:write'], secret: 'mfp_once' },
    });
    expect(cloud.pats).toHaveLength(2);

    expect(await client.revokePat(createdId)).toEqual({ ok: true, data: undefined });
    expect(cloud.pats.map((pat) => pat.id)).toEqual([existing.id]);

    for (const { init } of cloud.requests) {
      expect(init.headers).toMatchObject({
        authorization: 'Bearer session-token',
        origin: 'https://memo.test',
      });
    }
    // The write scope chosen in the shared UI reaches the cloud unchanged.
    const createRequest = cloud.requests.find(({ init }) => init.method === 'POST');
    expect(JSON.parse(String(createRequest?.init.body))).toMatchObject({
      scopes: ['goals:read', 'goals:write'],
      idempotencyKey: 'desktop-intent-1',
    });
  });

  it('surfaces a revoked cloud session to the settings section as EAG_UNAUTHORIZED', async () => {
    startCloudStub();
    const handlers = new Map<string, (event: unknown, input?: unknown) => Promise<unknown>>();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler as never);
      return undefined as never;
    });
    registerExternalAgentIpc({
      runtime: {
        getActiveProfileDescriptorSync: () => ({
          profileId: 'profile-1',
          profileKind: 'registered',
        }),
      } as never,
      sessions: { getValidToken: async () => null } as never,
    });
    const client = createExternalAgentIpcClient(
      createResultIpcClient({
        bridge: {
          invoke: (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args),
          on: () => undefined,
          off: () => undefined,
        },
        enableLogging: false,
      }),
    );

    expect(await client.listPats()).toMatchObject({ ok: false, error: { code: 'EAG_UNAUTHORIZED' } });
  });

  it('wires the shared settings key to the desktop IPC transport', () => {
    const source = readFileSync(
      resolve(__dirname, 'di-app.ts'),
      'utf8',
    );
    expect(source).toContain(
      'app.provide(EXTERNAL_AGENT_SERVICE_KEY, createExternalAgentIpcClient(resultIpcClient))',
    );
  });
});
