import { z } from 'zod';
import {
  ExternalAgentConsentSchema,
  OAuthConnectionSchema,
  ScopedPatSummarySchema,
  CreateScopedPatSchema,
  externalAgentFailure,
  type ExternalAgentClientPort,
  type ExternalAgentResult,
  type ExternalAgentFailureCode,
} from '@memoflow/contracts/agent-gateway';
import { fail, ok } from '@memoflow/contracts/result';

/** Cookie-authenticated account controls with validated wire responses. */
export function createExternalAgentHttpClient(baseUrl: string): ExternalAgentClientPort {
  const origin = baseUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    method = 'GET',
    body?: unknown,
  ): Promise<ExternalAgentResult<T>> {
    try {
      const response = await fetch(`${origin}${path}`, {
        method,
        credentials: 'include',
        redirect: 'error',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        const code: ExternalAgentFailureCode =
          response.status === 401
            ? 'EAG_UNAUTHORIZED'
            : response.status === 403
              ? 'EAG_FORBIDDEN'
              : response.status === 404
                ? 'EAG_SERVICE_DISABLED'
                : response.status === 429
                  ? 'EAG_RATE_LIMITED'
                  : response.status >= 500
                    ? 'EAG_SERVICE_UNAVAILABLE'
                    : response.status === 400
                      ? path.includes('consent')
                        ? 'EAG_CONSENT_INVALID'
                        : 'EAG_VALIDATION_ERROR'
                      : 'EAG_INVALID_RESPONSE';
        return fail(externalAgentFailure(code));
      }
      try {
        const payload: unknown = response.status === 204 ? undefined : await response.json();
        const parsed = schema.safeParse(payload);
        return parsed.success
          ? ok(parsed.data)
          : fail(externalAgentFailure('EAG_INVALID_RESPONSE'));
      } catch {
        return fail(externalAgentFailure('EAG_INVALID_RESPONSE'));
      }
    } catch {
      return fail(externalAgentFailure('EAG_NETWORK_ERROR'));
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
