import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { desktopSignInPlugin } from './desktop-sign-in';

const origin = 'https://auth.memo.test';
const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const redirect = 'http://127.0.0.1:32123/auth/callback';
const state = 's'.repeat(43);
function fixture() {
  const database: Record<string, Record<string, unknown>[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
  };
  const auth = betterAuth({
    baseURL: `${origin}/api/auth`,
    secret: 'desktop-sign-in-test-secret-at-least-32-characters',
    database: memoryAdapter(database),
    plugins: [desktopSignInPlugin()],
    socialProviders: { github: { clientId: 'github-test', clientSecret: 'test-secret' } },
  });
  async function begin(callback = redirect) {
    const url = new URL(`${origin}/api/auth/desktop-sign-in/github`);
    url.search = new URLSearchParams({
      redirect_uri: callback,
      state,
      code_challenge: challenge,
    }).toString();
    return auth.handler(new Request(url));
  }
  async function finish(start: Response, error = false) {
    const provider = new URL(start.headers.get('location')!);
    const url = new URL(`${origin}/api/auth/callback/github`);
    url.searchParams.set('state', provider.searchParams.get('state')!);
    url.searchParams.set(error ? 'error' : 'code', error ? 'access_denied' : 'github-code');
    return auth.handler(
      new Request(url, {
        headers: {
          cookie: start.headers
            .getSetCookie()
            .map((c) => c.split(';')[0])
            .join('; '),
        },
      }),
    );
  }
  async function exchange(code: string, proof = verifier) {
    return auth.handler(
      new Request(`${origin}/api/auth/desktop-sign-in/exchange`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, code_verifier: proof }),
      }),
    );
  }
  return { auth, database, begin, finish, exchange };
}
function mockGithub() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes('/login/oauth/access_token'))
        return Response.json({
          access_token: 'github-token',
          token_type: 'bearer',
          scope: 'read:user,user:email',
        });
      if (value.endsWith('/user/emails'))
        return Response.json([{ email: 'test@example.com', primary: true, verified: true }]);
      if (value.endsWith('/user'))
        return Response.json({
          id: 123,
          login: 'tester',
          name: 'Tester',
          email: 'test@example.com',
        });
      throw new Error('Unexpected external request');
    }),
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('desktop browser GitHub sign-in', () => {
  it('opens GitHub directly and carries browser state cookies', async () => {
    const { begin } = fixture();
    const response = await begin();
    expect(response.status).toBe(302);
    const url = new URL(response.headers.get('location')!);
    expect(url.origin).toBe('https://github.com');
    expect(url.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/callback/github`);
    expect(response.headers.getSetCookie().length).toBeGreaterThan(0);
  });
  it.each([
    'https://evil.test/auth/callback',
    'http://localhost:42/auth/callback',
    'http://127.0.0.1:42/wrong',
    'http://127.0.0.1:42/auth/callback?token=bad',
    'http://user@127.0.0.1:42/auth/callback',
  ])('rejects unsafe callbacks: %s', async (url) => {
    const { begin, database } = fixture();
    expect((await begin(url)).status).toBe(400);
    expect(database.verification).toHaveLength(0);
  });
  it('returns denial to the local attempt without minting a credential', async () => {
    const { begin, finish, database } = fixture();
    const response = await finish(await begin(), true);
    expect(response.status).toBe(302);
    const url = new URL(response.headers.get('location')!);
    expect(url.origin + url.pathname).toBe(redirect);
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(database.verification.some((row) => String(row.identifier).includes(':grant:'))).toBe(
      false,
    );
  });
  it('hands off only a one-time PKCE-bound code, issuing a separate desktop session', async () => {
    mockGithub();
    const { begin, finish, exchange, database } = fixture();
    const response = await finish(await begin());
    expect(response.status).toBe(302);
    const url = new URL(response.headers.get('location')!);
    expect(url.origin + url.pathname).toBe(redirect);
    expect(url.searchParams.get('state')).toBe(state);
    const code = url.searchParams.get('code')!;
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.toString()).not.toContain('token');
    expect((await exchange(code, 'b'.repeat(43))).status).toBe(400);
    const results = await Promise.all([exchange(code), exchange(code)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const success = results.find((r) => r.status === 200)!;
    const payload = await success.json();
    expect(payload.token).toBeTruthy();
    expect(database.session).toHaveLength(2);
    expect(success.headers.getSetCookie()).toHaveLength(0);
    expect(database.verification.some((row) => String(row.identifier).includes(':grant:'))).toBe(
      false,
    );
  });
  it('does not issue a handoff from a forged provider callback without state cookies', async () => {
    const { begin, auth, database } = fixture();
    const start = await begin();
    const provider = new URL(start.headers.get('location')!);
    await auth.handler(
      new Request(
        `${origin}/api/auth/callback/github?error=access_denied&state=${provider.searchParams.get('state')}`,
      ),
    );
    expect(database.verification.some((row) => String(row.identifier).includes(':grant:'))).toBe(
      false,
    );
  });
  it('rejects a handoff after the browser session has been revoked', async () => {
    mockGithub();
    const { begin, finish, exchange, database } = fixture();
    const response = await finish(await begin());
    const code = new URL(response.headers.get('location')!).searchParams.get('code')!;
    database.session.splice(0);
    expect((await exchange(code)).status).toBe(400);
    expect(database.session).toHaveLength(0);
  });

  it('leaves ordinary Web GitHub callbacks unchanged', async () => {
    mockGithub();
    const { auth, finish, database } = fixture();
    const started = await auth.handler(
      new Request(`${origin}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'github', callbackURL: '/' }),
      }),
    );
    const provider = (await started.json()).url;
    const headers = new Headers(started.headers);
    headers.set('location', provider);
    const response = await finish(new Response(null, { status: 302, headers }));
    expect(response.headers.get('location')).toBe('/');
    expect(database.session).toHaveLength(1);
    expect(database.verification.some((row) => String(row.identifier).includes(':grant:'))).toBe(
      false,
    );
  });

  it('rejects expired grants before issuing a session', async () => {
    mockGithub();
    const { begin, finish, exchange, database } = fixture();
    const response = await finish(await begin());
    const code = new URL(response.headers.get('location')!).searchParams.get('code')!;
    const grant = database.verification.find((row) => String(row.identifier).includes(':grant:'))!;
    grant.expiresAt = new Date(0);
    expect((await exchange(code)).status).toBe(400);
    expect(database.session).toHaveLength(1);
  });
});
