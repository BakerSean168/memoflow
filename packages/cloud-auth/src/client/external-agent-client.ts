import { z } from 'zod';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import { ExternalAgentChannels } from '@memoflow/desktop-contracts';
import {
  CreateScopedPatSchema,
  ExternalAgentConsentSchema,
  ExternalAgentFailureSchema,
  OAuthConnectionSchema,
  ScopedPatCreationSchema,
  ScopedPatSummarySchema,
  externalAgentFailure,
  type CreateScopedPatInput,
  type ExternalAgentClientPort,
  type ExternalAgentFailureCode,
  type ExternalAgentResult,
} from '@memoflow/agent-gateway';
import { fail, ok } from '@memoflow/transport-contracts/result';

const CONNECTIONS_ROOT = '/api/v1/agent-connections';

/** HTTP status → public failure code, shared by every transport variant. */
function failureCodeForStatus(status: number, path: string): ExternalAgentFailureCode {
  if (status === 401) return 'EAG_UNAUTHORIZED';
  if (status === 403) return 'EAG_FORBIDDEN';
  if (status === 404) return 'EAG_SERVICE_DISABLED';
  if (status === 409) return 'EAG_CONFLICT';
  if (status === 429) return 'EAG_RATE_LIMITED';
  if (status >= 500) return 'EAG_SERVICE_UNAVAILABLE';
  if (status === 400)
    return path.includes('consent') ? 'EAG_CONSENT_INVALID' : 'EAG_VALIDATION_ERROR';
  return 'EAG_INVALID_RESPONSE';
}

interface ExternalAgentRequestContext {
  origin: string;
  /** Web cookie sessions; the desktop main process authenticates with a bearer token. */
  credentials?: RequestCredentials;
  /** Extra headers resolved per request (desktop: bearer token + trusted Web Origin). */
  headers?: () => Record<string, string>;
}

function normalizeOrigin(baseUrl: string): string {
  return baseUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
}

function createExternalAgentClient(context: ExternalAgentRequestContext): ExternalAgentClientPort {
  const origin = normalizeOrigin(context.origin);
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    method = 'GET',
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<ExternalAgentResult<T>> {
    try {
      const extra = { ...context.headers?.(), ...extraHeaders };
      const headers: Record<string, string> = {};
      if (body !== undefined) headers['content-type'] = 'application/json';
      Object.assign(headers, extra);
      const response = await fetch(`${origin}${path}`, {
        method,
        credentials: context.credentials,
        redirect: 'error',
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        return fail(externalAgentFailure(failureCodeForStatus(response.status, path)));
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
  const list = <T>(path: string, schema: z.ZodType<T>) =>
    request(path, z.object({ data: schema })).then((result) =>
      result.ok ? ok(result.data.data) : result,
    );
  return {
    capabilities: () =>
      request(`${CONNECTIONS_ROOT}/capabilities`, z.object({ oauth: z.boolean() })),
    consentRequest: (oauthQuery) =>
      request('/api/auth/external-agent/consent-request', ExternalAgentConsentSchema, 'POST', {
        oauth_query: oauthQuery,
      }),
    decideConsent: (oauthQuery, accept, scopes) =>
      request(
        '/api/auth/oauth2/consent',
        z.object({
          url: z.url().refine((url) => ['http:', 'https:'].includes(new URL(url).protocol)),
        }),
        'POST',
        {
          oauth_query: oauthQuery,
          accept,
          ...(scopes && scopes.length > 0 ? { scope: scopes.join(' ') } : {}),
        },
      ),
    listConnections: () => list(`${CONNECTIONS_ROOT}/oauth`, z.array(OAuthConnectionSchema)),
    revokeConnection: (id) =>
      request(`${CONNECTIONS_ROOT}/oauth/${z.uuid().parse(id)}`, z.undefined(), 'DELETE'),
    listPats: () => list(`${CONNECTIONS_ROOT}/pats`, z.array(ScopedPatSummarySchema)),
    createPat: (input) => {
      const parsed = CreateScopedPatSchema.parse(input);
      return request(
        `${CONNECTIONS_ROOT}/pats`,
        z.object({ data: ScopedPatCreationSchema }),
        'POST',
        parsed,
        parsed.idempotencyKey ? { 'idempotency-key': parsed.idempotencyKey } : undefined,
      ).then((result) => (result.ok ? ok(result.data.data) : result));
    },
    revokePat: (id) =>
      request(`${CONNECTIONS_ROOT}/pats/${z.uuid().parse(id)}`, z.undefined(), 'DELETE'),
  };
}

/** Cookie-authenticated account controls with validated wire responses (Web). */
export function createExternalAgentHttpClient(baseUrl: string): ExternalAgentClientPort {
  return createExternalAgentClient({ origin: baseUrl, credentials: 'include' });
}

/**
 * Main-process desktop variant (Issue #1030).
 *
 * The Better Auth session token never leaves the main process, so this client
 * sends it as a bearer credential. The explicit trusted Web Origin header
 * satisfies the API's first-party mutation gate, which cookie-less clients
 * otherwise fail.
 */
export function createExternalAgentBearerClient(options: {
  origin: string;
  webOrigin: string;
  token: string;
}): ExternalAgentClientPort {
  return createExternalAgentClient({
    origin: options.origin,
    headers: () => ({
      authorization: `Bearer ${options.token}`,
      origin: options.webOrigin,
    }),
  });
}

/**
 * Renderer-side desktop variant (Issue #1030).
 *
 * The same port the Web components inject, backed by the main process. Failures
 * arrive as typed public failures so the shared UI keeps its code branches
 * (`EAG_SERVICE_DISABLED` hides the section, 401 renders a retry).
 */
export function createExternalAgentIpcClient(ipcClient: IResultIpcClient): ExternalAgentClientPort {
  async function invoke<T>(channel: string, ...args: unknown[]): Promise<ExternalAgentResult<T>> {
    const result = await ipcClient.invoke<T>(channel, ...args);
    if (result.ok) return ok(result.data);
    const failure = ExternalAgentFailureSchema.safeParse(result.error.failure);
    return fail(failure.success ? failure.data : externalAgentFailure('EAG_INVALID_RESPONSE'));
  }
  // Consent belongs to the browser OAuth journey; the desktop settings surface
  // never calls it, so the port reports the service as unavailable there.
  const unsupported = () => Promise.resolve(fail(externalAgentFailure('EAG_SERVICE_DISABLED')));
  return {
    capabilities: () => invoke(ExternalAgentChannels.CAPABILITIES),
    consentRequest: unsupported,
    decideConsent: unsupported,
    listConnections: () => invoke(ExternalAgentChannels.LIST_CONNECTIONS),
    revokeConnection: (id) => invoke(ExternalAgentChannels.REVOKE_CONNECTION, z.uuid().parse(id)),
    listPats: () => invoke(ExternalAgentChannels.LIST_PATS),
    createPat: (input: CreateScopedPatInput) => {
      const parsed = CreateScopedPatSchema.parse(input);
      return invoke(ExternalAgentChannels.CREATE_PAT, parsed);
    },
    revokePat: (id) => invoke(ExternalAgentChannels.REVOKE_PAT, z.uuid().parse(id)),
  };
}
