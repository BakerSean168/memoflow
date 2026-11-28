import { createHash, randomBytes } from 'node:crypto';
import type { BetterAuthPlugin } from 'better-auth';
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getOAuthState,
  signInSocial,
} from 'better-auth/api';
import { z } from 'zod';

const PREFIX = 'desktop-sign-in:';
const digest = (value: string) => createHash('sha256').update(value).digest('base64url');
const random = () => randomBytes(32).toString('base64url');
const proof = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const loopback = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      !!url.port &&
      url.pathname === '/auth/callback' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, 'Invalid desktop callback');
const requestSchema = z.object({ redirect_uri: loopback, state: proof, code_challenge: proof });

/** Browser OAuth and a single-use, PKCE-bound handoff to a local desktop listener. */
export function desktopSignInPlugin(): BetterAuthPlugin {
  return {
    id: 'memoflow-desktop-sign-in',
    endpoints: {
      desktopGithubSignIn: createAuthEndpoint(
        '/desktop-sign-in/github',
        {
          method: 'GET',
          query: requestSchema,
        },
        async (ctx) => {
          const requestId = random();
          const callbackURL = `${ctx.context.baseURL}/desktop-sign-in/result?request=${requestId}`;
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: `${PREFIX}request:${requestId}`,
            value: JSON.stringify(ctx.query),
            expiresAt: new Date(Date.now() + 10 * 60_000),
          });
          // Run in the browser's request so Better Auth's OAuth state cookie stays
          // in that browser. Never initiate provider OAuth from the Node client.
          try {
            const result = await signInSocial()({
              ...ctx,
              method: 'POST',
              asResponse: false,
              returnHeaders: true,
              body: { provider: 'github', callbackURL, errorCallbackURL: callbackURL },
            });
            const headers = new Headers(result.headers);
            headers.set('location', result.response.url!);
            headers.set('cache-control', 'no-store');
            headers.set('referrer-policy', 'no-referrer');
            return new Response(null, { status: 302, headers });
          } catch {
            await ctx.context.internalAdapter.deleteVerificationByIdentifier(
              `${PREFIX}request:${requestId}`,
            );
            const target = new URL(ctx.query.redirect_uri);
            target.searchParams.set('state', ctx.query.state);
            target.searchParams.set('error', 'provider_unavailable');
            throw ctx.redirect(target.toString());
          }
        },
      ),
      desktopSignInResult: createAuthEndpoint(
        '/desktop-sign-in/result',
        { method: 'GET' },
        async (ctx) => {
          ctx.setHeader('cache-control', 'no-store');
          return new Response('登录未完成或请求已过期。请返回 MemoFlow 重试。', {
            headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
          });
        },
      ),
      exchangeDesktopSignIn: createAuthEndpoint(
        '/desktop-sign-in/exchange',
        {
          method: 'POST',
          body: z.object({ code: proof, code_verifier: proof }),
        },
        async (ctx) => {
          const store = ctx.context.internalAdapter;
          const key = `${PREFIX}grant:${digest(ctx.body.code)}`;
          const existing = await store.findVerificationValue(key);
          const invalid = () =>
            new APIError('BAD_REQUEST', {
              code: 'DESKTOP_SIGN_IN_INVALID',
              message: '登录请求已失效，请重新登录',
            });
          if (!existing || existing.expiresAt <= new Date()) throw invalid();
          const grant = JSON.parse(existing.value) as {
            userId: string;
            sessionId: string;
            challenge: string;
          };
          if (grant.challenge !== digest(ctx.body.code_verifier)) throw invalid();
          const browserSession = await ctx.context.adapter.findOne<{
            userId: string;
            expiresAt: Date;
          }>({
            model: 'session',
            where: [{ field: 'id', value: grant.sessionId }],
          });
          if (
            !browserSession ||
            browserSession.userId !== grant.userId ||
            browserSession.expiresAt <= new Date()
          )
            throw invalid();
          // The atomic consume prevents concurrent redemption. Failed PKCE does
          // not consume someone else's grant. Never share the browser session.
          if (!(await store.consumeVerificationValue(key))) throw invalid();
          const session = await store.createSession(grant.userId);
          if (!session) throw invalid();
          ctx.setHeader('cache-control', 'no-store');
          return ctx.json({ token: session.token });
        },
      ),
    },
    hooks: {
      after: [
        {
          matcher: (ctx) =>
            ctx.path === '/callback/:id' && ctx.params?.id === 'github' && ctx.method === 'GET',
          handler: createAuthMiddleware(async (ctx) => {
            const state = await getOAuthState();
            if (!state) return;
            const callback = new URL(state.callbackURL, ctx.context.baseURL);
            const expected = new URL(`${ctx.context.baseURL}/desktop-sign-in/result`);
            if (callback.origin !== expected.origin || callback.pathname !== expected.pathname)
              return;
            const requestId = callback.searchParams.get('request');
            if (!proof.safeParse(requestId).success) return;
            const row = await ctx.context.internalAdapter.consumeVerificationValue(
              `${PREFIX}request:${requestId}`,
            );
            if (!row || row.expiresAt <= new Date()) return;
            const request = requestSchema.parse(JSON.parse(row.value));
            const target = new URL(request.redirect_uri);
            target.searchParams.set('state', request.state);
            if (ctx.context.newSession) {
              const code = random();
              await ctx.context.internalAdapter.createVerificationValue({
                identifier: `${PREFIX}grant:${digest(code)}`,
                value: JSON.stringify({
                  userId: ctx.context.newSession.user.id,
                  sessionId: ctx.context.newSession.session.id,
                  challenge: request.code_challenge,
                }),
                expiresAt: new Date(Date.now() + 60_000),
              });
              target.searchParams.set('code', code);
            } else {
              target.searchParams.set(
                'error',
                ctx.query?.error === 'access_denied' ? 'access_denied' : 'authorization_failed',
              );
            }
            ctx.setHeader('cache-control', 'no-store');
            ctx.setHeader('referrer-policy', 'no-referrer');
            throw ctx.redirect(target.toString());
          }),
        },
      ],
    },
  };
}
