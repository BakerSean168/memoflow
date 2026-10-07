import { z } from 'zod';
import {
  ExternalAgentConsentSchema,
  OAuthConnectionSchema,
  ScopedPatSummarySchema,
  CreateScopedPatSchema,
  type ExternalAgentClientPort,
} from '@memoflow/contracts/agent-gateway';
import { fail, ok, type Result } from '@memoflow/contracts/result';

/** Cookie-authenticated account controls with validated wire responses. */
export function createExternalAgentHttpClient(baseUrl: string): ExternalAgentClientPort {
  const origin = baseUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    method = 'GET',
    body?: unknown,
  ): Promise<Result<T>> {
    try {
      const response = await fetch(`${origin}${path}`, {
        method,
        credentials: 'include',
        redirect: 'error',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok)
        return fail({
          code: `HTTP_${response.status}`,
          message: '无法处理连接请求，请重新登录或重试。',
        });
      const payload: unknown = response.status === 204 ? undefined : await response.json();
      const parsed = schema.safeParse(payload);
      return parsed.success
        ? ok(parsed.data)
        : fail({ code: 'INVALID_RESPONSE', message: '连接服务响应无效。' });
    } catch {
      return fail({ code: 'NETWORK_ERROR', message: '无法连接服务器，请稍后重试。' });
    }
  }
  const root = '/api/v1/agent-connections';
  const list = <T>(path: string, schema: z.ZodType<T>) =>
    request(path, z.object({ data: schema })).then((result) =>
      result.ok ? ok(result.data.data) : result,
    );
  return {
    capabilities: () => request(`${root}/capabilities`, z.object({ oauth: z.boolean() })),
    consentRequest: (oauthQuery) =>
      request('/api/auth/external-agent/consent-request', ExternalAgentConsentSchema, 'POST', {
        oauth_query: oauthQuery,
      }),
    decideConsent: (oauthQuery, accept) =>
      request(
        '/api/auth/oauth2/consent',
        z.object({
          url: z.url().refine((url) => ['http:', 'https:'].includes(new URL(url).protocol)),
        }),
        'POST',
        { oauth_query: oauthQuery, accept },
      ),
    listConnections: () => list(`${root}/oauth`, z.array(OAuthConnectionSchema)),
    revokeConnection: (id) =>
      request(`${root}/oauth/${z.uuid().parse(id)}`, z.undefined(), 'DELETE'),
    listPats: () => list(`${root}/pats`, z.array(ScopedPatSummarySchema)),
    createPat: (input) =>
      request(
        `${root}/pats`,
        z.object({ data: ScopedPatSummarySchema.extend({ secret: z.string().min(1) }) }),
        'POST',
        CreateScopedPatSchema.parse(input),
      ).then((result) => (result.ok ? ok(result.data.data) : result)),
    revokePat: (id) => request(`${root}/pats/${z.uuid().parse(id)}`, z.undefined(), 'DELETE'),
  };
}
