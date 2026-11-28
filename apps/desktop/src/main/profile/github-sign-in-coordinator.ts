import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { clipboard, shell } from 'electron';
import {
  DesktopGithubSignInAttemptSchema,
  type DesktopGithubSignInAttempt,
} from '@memoflow/cloud-auth-contracts';
import { fail, ok, type Result } from '@memoflow/transport-contracts/result';
import { getApiBaseUrl } from '../utils/api-config';
import { desktopClientUserAgent } from '../utils/desktop-client-identity';
import type { DesktopCloudSignInService } from './desktop-cloud-sign-in-service';

const TTL_MS = 10 * 60_000;
const terminal = new Set(['connected', 'denied', 'expired', 'cancelled', 'failed']);
interface Attempt {
  snapshot: DesktopGithubSignInAttempt;
  server: Server;
  timer: ReturnType<typeof setTimeout>;
  controller: AbortController;
  browserUrl: string;
  state: string;
  verifier: string;
  remember: boolean;
}
export interface GithubSignInOptions {
  fetchImpl?: typeof fetch;
  openExternal?: (url: string) => Promise<unknown>;
  copyText?: (text: string) => void;
}

/** One browser login per identity window; credentials never enter the renderer. */
export class GithubSignInCoordinator {
  private attempt: Attempt | null = null;
  private starting = false;
  private generation = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly openExternal: (url: string) => Promise<unknown>;
  private readonly copyText: (text: string) => void;

  constructor(
    private readonly signIn: Pick<DesktopCloudSignInService, 'adoptBrowserToken'>,
    options: GithubSignInOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.openExternal = options.openExternal ?? ((url) => shell.openExternal(url));
    this.copyText = options.copyText ?? ((text) => clipboard.writeText(text));
  }

  async begin(input: { remember: boolean }): Promise<Result<DesktopGithubSignInAttempt>> {
    if (this.attempt && !terminal.has(this.attempt.snapshot.status))
      return ok(this.snapshot(this.attempt));
    if (this.starting) return fail({ code: 'SIGN_IN_BUSY', message: '正在打开登录页面，请稍候' });
    this.starting = true;
    const generation = ++this.generation;
    const server = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      if (generation !== this.generation) {
        server.close();
        return fail({ code: 'SIGN_IN_CANCELLED', message: '登录已取消' });
      }
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Callback unavailable');
      const state = randomBytes(32).toString('base64url');
      const verifier = randomBytes(32).toString('base64url');
      const browser = new URL('/api/auth/desktop-sign-in/github', getApiBaseUrl());
      browser.search = new URLSearchParams({
        redirect_uri: `http://127.0.0.1:${address.port}/auth/callback`,
        state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      }).toString();
      const attempt: Attempt = {
        snapshot: {
          attemptId: randomUUID(),
          status: 'awaiting_authorization',
          result: null,
          expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
          browserOpened: false,
          error: null,
        },
        server,
        controller: new AbortController(),
        browserUrl: browser.toString(),
        state,
        verifier,
        remember: input.remember,
        timer: setTimeout(() => this.finish(attempt, 'expired', '登录已超时，请重试'), TTL_MS),
      };
      attempt.timer.unref();
      this.attempt = attempt;
      server.on('error', () => this.finish(attempt, 'failed', '无法接收浏览器登录结果，请重试'));
      server.requestTimeout = 10_000;
      server.headersTimeout = 10_000;
      server.on('request', (request, response) => {
        let url: URL;
        try {
          url = new URL(request.url ?? '/', `http://127.0.0.1:${address.port}`);
        } catch {
          response.writeHead(400).end();
          return;
        }
        response.setHeader('cache-control', 'no-store');
        response.setHeader('referrer-policy', 'no-referrer');
        response.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
        response.setHeader('content-type', 'text/plain; charset=utf-8');
        // Reject unrelated requests without burning the outstanding login.
        if (
          request.method !== 'GET' ||
          request.headers.host !== `127.0.0.1:${address.port}` ||
          url.origin !== `http://127.0.0.1:${address.port}` ||
          url.pathname !== '/auth/callback' ||
          url.searchParams.get('state') !== attempt.state
        ) {
          response.writeHead(400).end('无效的登录回调。');
          return;
        }
        if (attempt.snapshot.status !== 'awaiting_authorization') {
          response.writeHead(409).end('这次登录已经处理。');
          return;
        }
        const code = url.searchParams.get('code');
        if (url.searchParams.has('error') || !code || !/^[A-Za-z0-9_-]{43}$/.test(code)) {
          response.end('登录未完成。请返回 MemoFlow 重试。');
          this.finish(
            attempt,
            url.searchParams.get('error') === 'access_denied' ? 'denied' : 'failed',
            'GitHub 授权未完成，请重试',
          );
          return;
        }
        // Return browser success only after the desktop has adopted its session.
        attempt.snapshot.status = 'connecting_profile';
        clearTimeout(attempt.timer);
        server.close();
        void this.complete(attempt, code).then(() => {
          response.end(
            attempt.snapshot.status === 'connected'
              ? '登录成功，可以关闭此页面并返回 MemoFlow。'
              : '登录未完成，请返回 MemoFlow 查看并重试。',
          );
        });
      });
      await this.openBrowser(attempt);
      return ok(this.snapshot(attempt));
    } catch {
      server.close();
      return fail({ code: 'DESKTOP_CALLBACK_FAILED', message: '无法启动本机登录回调，请重试' });
    } finally {
      this.starting = false;
    }
  }

  getStatus(id: string): Result<DesktopGithubSignInAttempt> {
    return this.attempt?.snapshot.attemptId === id
      ? ok(this.snapshot(this.attempt))
      : this.missing();
  }
  async reopen(id: string): Promise<Result<DesktopGithubSignInAttempt>> {
    const attempt = this.attempt;
    if (!attempt || attempt.snapshot.attemptId !== id) return this.missing();
    if (attempt.snapshot.status !== 'awaiting_authorization')
      return fail({ code: 'SIGN_IN_BUSY', message: '请重新发起登录' });
    await this.openBrowser(attempt);
    return ok(this.snapshot(attempt));
  }
  copyLink(id: string): Result<void> {
    if (!this.attempt || this.attempt.snapshot.attemptId !== id) return this.missing();
    if (this.attempt.snapshot.status !== 'awaiting_authorization')
      return fail({ code: 'SIGN_IN_BUSY', message: '请重新发起登录' });
    try {
      this.copyText(this.attempt.browserUrl);
      return ok(undefined);
    } catch {
      return fail({ code: 'CLIPBOARD_FAILED', message: '无法复制登录链接，请重试' });
    }
  }
  cancel(id: string): Result<void> {
    if (!this.attempt || this.attempt.snapshot.attemptId !== id) return this.missing();
    if (this.attempt.snapshot.status === 'connecting_profile')
      return fail({ code: 'SIGN_IN_BUSY', message: '正在完成登录，请稍候' });
    if (!terminal.has(this.attempt.snapshot.status)) this.finish(this.attempt, 'cancelled');
    return ok(undefined);
  }
  dispose(): void {
    this.generation++;
    if (this.attempt) this.finish(this.attempt, 'cancelled');
  }
  private async openBrowser(attempt: Attempt): Promise<void> {
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          this.openExternal(attempt.browserUrl),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Browser launch timed out')), 10_000);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (attempt.snapshot.status !== 'awaiting_authorization') return;
      attempt.snapshot.browserOpened = true;
      attempt.snapshot.error = null;
    } catch {
      if (attempt.snapshot.status !== 'awaiting_authorization') return;
      attempt.snapshot.browserOpened = false;
      attempt.snapshot.error = {
        code: 'EXTERNAL_OPEN_FAILED',
        message: '未能打开系统浏览器，请重试或复制链接在本机浏览器打开',
      };
    }
  }
  private async complete(attempt: Attempt, code: string): Promise<void> {
    try {
      const response = await this.fetchImpl(
        new URL('/api/auth/desktop-sign-in/exchange', getApiBaseUrl()),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': desktopClientUserAgent() },
          body: JSON.stringify({ code, code_verifier: attempt.verifier }),
          signal: AbortSignal.any([attempt.controller.signal, AbortSignal.timeout(15_000)]),
        },
      );
      const payload = (await response.json().catch(() => null)) as { token?: unknown } | null;
      if (!response.ok || typeof payload?.token !== 'string' || !payload.token) {
        this.finish(attempt, 'failed', '无法完成 GitHub 登录，请重新授权');
        return;
      }
      const adopted = await this.signIn.adoptBrowserToken(
        payload.token,
        attempt.remember,
        attempt.controller.signal,
      );
      if (attempt.controller.signal.aborted) return;
      if (!adopted.ok) {
        this.finish(attempt, 'failed', adopted.error.message);
        return;
      }
      attempt.snapshot.result = adopted.data;
      this.finish(attempt, 'connected');
    } catch {
      if (!attempt.controller.signal.aborted)
        this.finish(attempt, 'failed', '无法连接认证服务，请重试');
    }
  }
  private finish(
    attempt: Attempt,
    status: DesktopGithubSignInAttempt['status'],
    message?: string,
  ): void {
    clearTimeout(attempt.timer);
    attempt.server.close();
    attempt.controller.abort();
    attempt.verifier = '';
    attempt.browserUrl = '';
    attempt.snapshot.status = status;
    attempt.snapshot.error = message
      ? { code: `GITHUB_SIGN_IN_${status.toUpperCase()}`, message }
      : null;
  }
  private snapshot(attempt: Attempt): DesktopGithubSignInAttempt {
    return DesktopGithubSignInAttemptSchema.parse(attempt.snapshot);
  }
  private missing(): Result<never> {
    return fail({ code: 'SIGN_IN_ATTEMPT_NOT_FOUND', message: '登录请求不存在，请重试' });
  }
}
