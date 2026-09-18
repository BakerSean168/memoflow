import { ResultErrorException } from '@memoflow/contracts/result';
import { describe, expect, it } from 'vitest';
import { AIExecutionError } from '../../shared/ai-execution-error';
import { toAIPublicFailure } from '../../shared/ai-public-failure';
import { toAITransportFailure } from './ai-controller-errors';

const fallback = {
  fallbackCode: 'AI_RUNTIME_ERROR',
  fallbackMessage: 'AI runtime request failed',
} as const;

describe('AI public failure projection', () => {
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
