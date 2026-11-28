import { request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts/result';
import { GithubSignInCoordinator } from './github-sign-in-coordinator';

vi.mock('../utils/api-config', () => ({ getApiBaseUrl: () => 'https://auth.memo.test/api/v1' }));
const coordinators: GithubSignInCoordinator[] = [];
afterEach(() => {
  coordinators.splice(0).forEach((c) => c.dispose());
  vi.useRealTimers();
});
function fixture() {
  const openExternal = vi.fn().mockResolvedValue(undefined);
  const copyText = vi.fn();
  const adoptBrowserToken = vi.fn().mockResolvedValue(ok({ profileId: 'cloud-profile' }));
  const fetchImpl = vi.fn().mockResolvedValue(Response.json({ token: 'desktop-session-secret' }));
  const coordinator = new GithubSignInCoordinator(
    { adoptBrowserToken },
    { openExternal, copyText, fetchImpl },
  );
  coordinators.push(coordinator);
  function callback() {
    const browser = new URL(openExternal.mock.calls[0][0]);
    const url = new URL(browser.searchParams.get('redirect_uri')!);
    url.searchParams.set('state', browser.searchParams.get('state')!);
    url.searchParams.set('code', 'c'.repeat(43));
    return url;
  }
  return { coordinator, openExternal, copyText, adoptBrowserToken, fetchImpl, callback };
}

describe('GithubSignInCoordinator', () => {
  it('exchanges a local callback using PKCE and adopts only in the main process', async () => {
    const { coordinator, openExternal, adoptBrowserToken, fetchImpl, callback } = fixture();
    const begun = await coordinator.begin({ remember: false });
    if (!begun.ok) throw new Error('begin failed');
    const response = await fetch(callback());
    expect(await response.text()).toContain('登录成功');
    expect(adoptBrowserToken).toHaveBeenCalledWith(
      'desktop-session-secret',
      false,
      expect.any(AbortSignal),
    );
    const browser = new URL(openExternal.mock.calls[0][0]);
    expect(browser.pathname).toBe('/api/auth/desktop-sign-in/github');
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(createHash('sha256').update(body.code_verifier).digest('base64url')).toBe(
      browser.searchParams.get('code_challenge'),
    );
    const status = coordinator.getStatus(begun.data.attemptId);
    expect(status).toMatchObject({
      ok: true,
      data: { status: 'connected', result: { profileId: 'cloud-profile' } },
    });
    expect(JSON.stringify(status)).not.toMatch(/desktop-session-secret|code_verifier|redirect_uri/);
  });
  it('shows an open failure, preserves a usable link and reopens the same attempt', async () => {
    const { coordinator, openExternal, copyText } = fixture();
    openExternal.mockRejectedValueOnce(new Error('xdg-open failed'));
    const begun = await coordinator.begin({ remember: true });
    if (!begun.ok) throw new Error('begin failed');
    expect(begun.data).toMatchObject({
      status: 'awaiting_authorization',
      browserOpened: false,
      error: { code: 'EXTERNAL_OPEN_FAILED' },
    });
    expect(coordinator.copyLink(begun.data.attemptId)).toEqual(ok(undefined));
    expect(copyText).toHaveBeenCalledWith(openExternal.mock.calls[0][0]);
    expect(await coordinator.reopen(begun.data.attemptId)).toMatchObject({
      ok: true,
      data: { browserOpened: true, error: null },
    });
    expect(openExternal.mock.calls[1][0]).toBe(openExternal.mock.calls[0][0]);
  });
  it('recovers when the operating system never resolves the browser launch', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { coordinator, openExternal } = fixture();
    openExternal.mockImplementationOnce(() => new Promise(() => undefined));
    const pending = coordinator.begin({ remember: true });
    await new Promise((resolve) => setImmediate(resolve));
    expect(openExternal).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toMatchObject({
      ok: true,
      data: {
        status: 'awaiting_authorization',
        browserOpened: false,
        error: { code: 'EXTERNAL_OPEN_FAILED' },
      },
    });
  });

  it('rejects a malformed local HTTP target without crashing or consuming login', async () => {
    const { coordinator, callback } = fixture();
    const begun = await coordinator.begin({ remember: true });
    if (!begun.ok) throw new Error('begin failed');
    const url = callback();
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(
        { hostname: url.hostname, port: url.port, path: 'http://[' },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      request.on('error', reject);
      request.end();
    });
    expect(status).toBe(400);
    expect(coordinator.getStatus(begun.data.attemptId)).toMatchObject({
      ok: true,
      data: { status: 'awaiting_authorization' },
    });
  });

  it('rejects wrong state without consuming the outstanding login and handles denial', async () => {
    const { coordinator, callback, fetchImpl } = fixture();
    const begun = await coordinator.begin({ remember: true });
    if (!begun.ok) throw new Error('begin failed');
    const wrong = callback();
    wrong.searchParams.set('state', 'wrong');
    expect((await fetch(wrong)).status).toBe(400);
    expect(coordinator.getStatus(begun.data.attemptId)).toMatchObject({
      ok: true,
      data: { status: 'awaiting_authorization' },
    });
    const denied = callback();
    denied.searchParams.set('error', 'access_denied');
    await fetch(denied);
    expect(coordinator.getStatus(begun.data.attemptId)).toMatchObject({
      ok: true,
      data: { status: 'denied' },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('closes the callback on cancel, refuses stale attempts and permits retry', async () => {
    const { coordinator, callback, adoptBrowserToken } = fixture();
    const begun = await coordinator.begin({ remember: true });
    if (!begun.ok) throw new Error('begin failed');
    const oldCallback = callback();
    coordinator.cancel(begun.data.attemptId);
    await expect(fetch(oldCallback)).rejects.toThrow();
    expect(adoptBrowserToken).not.toHaveBeenCalled();
    const next = await coordinator.begin({ remember: false });
    expect(next.ok && next.data.attemptId).not.toBe(begun.data.attemptId);
    await expect(coordinator.reopen(begun.data.attemptId)).resolves.toMatchObject({ ok: false });
  });
  it('expires an unanswered login and closes its listener', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { coordinator, callback } = fixture();
    const begun = await coordinator.begin({ remember: true });
    if (!begun.ok) throw new Error('begin failed');
    const url = callback();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(coordinator.getStatus(begun.data.attemptId)).toMatchObject({
      ok: true,
      data: { status: 'expired' },
    });
    await expect(fetch(url)).rejects.toThrow();
  });
  it('keeps a failed exchange from creating a local profile', async () => {
    const { coordinator, callback, fetchImpl, adoptBrowserToken } = fixture();
    fetchImpl.mockResolvedValueOnce(Response.json({ error: 'invalid' }, { status: 400 }));
    const begun = await coordinator.begin({ remember: true });
    if (!begun.ok) throw new Error('begin failed');
    await fetch(callback());
    expect(coordinator.getStatus(begun.data.attemptId)).toMatchObject({
      ok: true,
      data: { status: 'failed' },
    });
    expect(adoptBrowserToken).not.toHaveBeenCalled();
  });
});
