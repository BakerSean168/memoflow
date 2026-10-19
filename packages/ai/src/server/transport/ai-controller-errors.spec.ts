import { ResultErrorException, fail, toHttpResponse, toIpcResult } from '@memoflow/contracts/result';
import { describe, expect, it } from 'vitest';
import { LocalAgentError } from '../../shared/local-agent-error';
import { AIExecutionError } from '../../shared/ai-execution-error';
import {
  readAIProviderFailureDiagnostics,
  toAIPublicFailure,
} from '../../shared/ai-public-failure';
import { toAITransportFailure } from './ai-controller-errors';

const fallback = {
  fallbackCode: 'AI_RUNTIME_ERROR',
  fallbackMessage: 'AI runtime request failed',
} as const;

describe('AI public failure projection', () => {
  it('preserves identical typed rate-limit metadata through HTTP and IPC envelopes', () => {
    const mapped = toAITransportFailure({ statusCode: 429,
      responseBody: JSON.stringify({ error: { code: 'rate_limit_exceeded', message: 'SECRET' } }),
      responseHeaders: { 'retry-after': '30' },
    }, fallback);
    const result = fail({ code: mapped.code, message: mapped.message, failure: mapped.failure });
    expect(toHttpResponse(result).error?.failure).toEqual(toIpcResult(result).error?.failure);
    expect(mapped.failure).toMatchObject({ code: 'RATE_LIMITED', category: 'rate_limited',
      details: { limitKind: 'rate_limit' }, retryHint: { kind: 'after', afterMs: 30000 },
    });
    expect(JSON.stringify({ http: toHttpResponse(result), ipc: toIpcResult(result) })).not.toContain('SECRET');
  });
  it('projects structured quota and retry information without provider text or metadata', () => {
    const failure = toAIPublicFailure({ statusCode: 429, responseBody: JSON.stringify({ error: {
      message: 'SECRET_API_KEY', details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [
          { quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '0', description: 'SECRET_API_KEY' },
        ] },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '30.25s' },
      ],
    } }) }, fallback);
    expect(failure).toMatchObject({
      code: 'RATE_LIMITED', details: { limitKind: 'quota_exhausted' },
      retryHint: { kind: 'after', afterMs: 30250 },
    });
    expect(JSON.stringify(failure)).not.toContain('SECRET_API_KEY');
    expect(JSON.stringify(failure)).not.toContain('quotaId');
  });

  it.each([
    ['insufficient_quota', 'quota_exhausted'],
    ['rate_limit_exceeded', 'rate_limit'],
  ])('classifies structured provider %s and safe retry-after', (code, limitKind) => {
    expect(toAIPublicFailure({ lastError: {
      statusCode: 429, responseBody: JSON.stringify({ error: { code, message: 'SECRET' } }),
      responseHeaders: { 'retry-after': '15' },
    } }, fallback)).toMatchObject({
      details: { limitKind }, retryHint: { kind: 'after', afterMs: 15000 },
    });
  });

  it('does not infer a quota reason from text or fabricate an invalid retry hint', () => {
    const failure = toAIPublicFailure({ statusCode: 429,
      responseBody: 'insufficient_quota: secret', responseHeaders: { 'retry-after': '-5' },
    }, fallback);
    expect(failure).not.toHaveProperty('details');
    expect(failure).not.toHaveProperty('retryHint');
  });

  it('classifies a retry-wrapped provider failure and bounds cyclic unknown causes', () => {
    const upstream = { statusCode: 503, responseBody: 'private provider details' };
    expect(toAIPublicFailure({ lastError: upstream }, fallback).code).toBe('SERVICE_UNAVAILABLE');
    expect(toAIPublicFailure({ cause: { name: 'TimeoutError' } }, fallback).code).toBe('TIMEOUT');
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(readAIProviderFailureDiagnostics(cyclic)).toEqual({ timedOut: false });
    expect(toAIPublicFailure(cyclic, fallback).code).toBe('AI_RUNTIME_ERROR');
    expect(toAIPublicFailure({ statusCode: 400 }, fallback).code).toBe('AI_RUNTIME_ERROR');
  });
  it.each([
    [401, 'PROVIDER_AUTH_FAILED'],
    [403, 'PROVIDER_AUTH_FAILED'],
    [404, 'MODEL_NOT_AVAILABLE'],
    [503, 'SERVICE_UNAVAILABLE'],
  ])('classifies provider HTTP %s without exposing raw diagnostics', (statusCode, code) => {
    const failure = toAIPublicFailure(
      { name: 'AI_APICallError', statusCode, responseBody: 'secret-body' },
      fallback,
    );
    expect(failure.code).toBe(code);
    expect(JSON.stringify(failure)).not.toContain('secret-body');
  });
  it('falls back for internal structured errors and projects only requestId', () => {
    const secret = 'server-secret-api-key';
    const error = new ResultErrorException(
      `provider=https://secret.example/api key=${secret}`,
      'PROVIDER_INTERNAL_V2',
      [{ field: 'provider', code: 'UPSTREAM_SECRET', message: secret, value: secret }],
      {
        requestId: ' request-internal-1 ',
        apiKey: secret,
        providerUrl: 'https://secret.example/api',
        diagnostics: { token: secret },
      },
      418,
      { secret },
    );

    const publicFailure = toAIPublicFailure(error, fallback);
    const transportFailure = toAITransportFailure(error, fallback);

    expect(publicFailure).toEqual({
      code: 'AI_RUNTIME_ERROR',
      message: 'AI runtime request failed',
      context: { requestId: 'request-internal-1' },
    });
    expect(transportFailure).toEqual({
      ...publicFailure,
      statusCode: 500,
    });
    expect(JSON.stringify({ publicFailure, transportFailure })).not.toContain(secret);
    expect(JSON.stringify({ publicFailure, transportFailure })).not.toContain('secret.example');
    expect(JSON.stringify({ publicFailure, transportFailure })).not.toContain(
      'PROVIDER_INTERNAL_V2',
    );
  });

  it('maps an allowlisted structured code and derives status from the public code', () => {
    const secret = 'provider-secret';
    const error = new ResultErrorException(
      `upstream diagnostics ${secret}`,
      'SERVICE_UNAVAILABLE',
      undefined,
      {
        requestId: 'request-safe-1',
        apiKey: secret,
        providerUrl: 'https://secret.example/api',
      },
      418,
    );

    expect(toAITransportFailure(error, fallback)).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'AI service is unavailable',
      statusCode: 503,
      context: { requestId: 'request-safe-1' },
    });
    expect(JSON.stringify(toAITransportFailure(error, fallback))).not.toContain(secret);
  });

  it('maps raw provider 429 failures without leaking provider diagnostics', () => {
    const secret = 'provider-private-response';
    const failure = toAIPublicFailure(
      {
        name: 'AI_APICallError',
        statusCode: 429,
        responseBody: secret,
        requestBodyValues: { apiKey: secret },
      },
      fallback,
    );

    expect(failure).toEqual({
      code: 'RATE_LIMITED',
      message: 'AI provider rate limit exceeded',
    });
    expect(JSON.stringify(failure)).not.toContain(secret);
  });

  it('keeps AI execution category mapping stable and secret-safe', () => {
    const secret = 'provider-runtime-secret';
    expect(
      toAITransportFailure(
        new AIExecutionError('provider_unavailable', `provider=${secret}`, {
          requestId: 'request-ai-1',
          statusCode: 418,
        }),
        fallback,
      ),
    ).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'AI service is unavailable',
      statusCode: 503,
      context: { requestId: 'request-ai-1' },
    });
  });
});

it.each([
  ['LOCAL_AGENT_LOGIN_REQUIRED', 'Sign in using the Agent’s native login command, then refresh.'],
  ['LOCAL_AGENT_UNAVAILABLE', 'The local Agent is unavailable. Check its native configuration.'],
] as const)('re-maps a tainted %s exception at the final public transport boundary', (code, message) => {
  const error = new LocalAgentError(code);
  error.message = 'C:\\Users\\PRIVATE_HOME_FIXTURE PRIVATE_ACCOUNT_FIXTURE@example.test api_key=PRIVATE_KEY_FIXTURE';
  expect(toAITransportFailure(error, fallback)).toMatchObject({ code, message });
  expect(JSON.stringify(toAITransportFailure(error, fallback))).not.toContain('PRIVATE_');
});

it('uses the fixed Desktop fallback for an unknown private native exception', () => {
  const error = new Error('PRIVATE_STDERR_FIXTURE C:\\Users\\PRIVATE_HOME_FIXTURE PRIVATE_KEY_FIXTURE');
  const failure = toAITransportFailure(error, {
    fallbackCode: 'INTERNAL_ERROR', fallbackMessage: 'Local Agent operation failed',
  });
  expect(failure).toEqual({ code: 'INTERNAL_ERROR', message: 'Local Agent operation failed', statusCode: 500 });
  expect(JSON.stringify(failure)).not.toContain('PRIVATE_');
});

it('preserves the Google sign-in action at the public boundary while rejecting tainted diagnostics', () => {
  const error = new LocalAgentError('LOCAL_AGENT_LOGIN_REQUIRED', 'antigravity');
  error.message = 'PRIVATE_TOKEN';
  expect(toAITransportFailure(error, fallback)).toMatchObject({
    code: 'LOCAL_AGENT_LOGIN_REQUIRED',
    message:
      'Google sign-in is required. Open Settings → AI → Providers → Antigravity and select “Sign in with Google”.',
  });
});
