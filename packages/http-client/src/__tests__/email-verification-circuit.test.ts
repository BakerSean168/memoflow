import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEmailVerificationBlockedError,
  canAttemptEmailVerificationSensitiveRequest,
  getEmailVerificationHitCount,
  isEmailVerificationCircuitTripped,
  isEmailVerificationRequiredError,
  recordEmailVerificationRequired,
  resetEmailVerificationCircuit,
  resourceKeyFromUrl,
  EMAIL_VERIFICATION_DOMAIN_CODE,
  EMAIL_VERIFICATION_MESSAGE_KEY,
} from '../email-verification-circuit';
import { ResultHttpClient } from '../result-http-client';

describe('email-verification-circuit', () => {
  beforeEach(() => {
    resetEmailVerificationCircuit();
  });

  it('normalizes resource keys from absolute and relative URLs', () => {
    expect(resourceKeyFromUrl('/api/v1/repositories/knowledge-notes?limit=20')).toBe(
      '/api/v1/repositories/knowledge-notes',
    );
    expect(resourceKeyFromUrl('https://example.com/api/v1/notes?x=1')).toBe('/api/v1/notes');
  });

  it('detects EMAIL_VERIFICATION_REQUIRED via domainCode or code', () => {
    expect(isEmailVerificationRequiredError({ domainCode: EMAIL_VERIFICATION_DOMAIN_CODE })).toBe(
      true,
    );
    expect(isEmailVerificationRequiredError({ code: EMAIL_VERIFICATION_DOMAIN_CODE })).toBe(true);
    expect(isEmailVerificationRequiredError({ code: 'FORBIDDEN' })).toBe(false);
  });

  it('allows two hits then blocks further attempts for the same resource', () => {
    const resource = '/api/v1/repositories/knowledge-notes';

    expect(canAttemptEmailVerificationSensitiveRequest(resource)).toBe(true);
    expect(recordEmailVerificationRequired(resource)).toBe(1);
    expect(canAttemptEmailVerificationSensitiveRequest(resource)).toBe(true);
    expect(recordEmailVerificationRequired(resource)).toBe(2);
    expect(canAttemptEmailVerificationSensitiveRequest(resource)).toBe(false);
    expect(getEmailVerificationHitCount(resource)).toBe(2);
    expect(isEmailVerificationCircuitTripped()).toBe(true);

    const blocked = buildEmailVerificationBlockedError(resource);
    expect(blocked.domainCode).toBe(EMAIL_VERIFICATION_DOMAIN_CODE);
    expect(blocked.messageKey).toBe(EMAIL_VERIFICATION_MESSAGE_KEY);
    expect(blocked.shortCircuited).toBe(true);
  });

  it('does not share budget across different resources until each trips', () => {
    recordEmailVerificationRequired('/a');
    expect(canAttemptEmailVerificationSensitiveRequest('/b')).toBe(true);
    recordEmailVerificationRequired('/a');
    expect(canAttemptEmailVerificationSensitiveRequest('/a')).toBe(false);
    expect(canAttemptEmailVerificationSensitiveRequest('/b')).toBe(true);
  });
});

describe('ResultHttpClient EMAIL_VERIFICATION_REQUIRED fuse', () => {
  beforeEach(() => {
    resetEmailVerificationCircuit();
  });

  it('hits transport at most twice for the same resource then short-circuits', async () => {
    const client = new ResultHttpClient({ baseURL: 'http://localhost' });
    const axios = client.getAxiosInstance();
    let transportHits = 0;

    // Mirror real middleware shape: domainCode lives under error.context
    axios.defaults.adapter = async (config) => {
      transportHits += 1;
      throw Object.assign(new Error('Forbidden'), {
        response: {
          data: {
            ok: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Email verification is required before continuing.',
              context: { domainCode: EMAIL_VERIFICATION_DOMAIN_CODE },
            },
          },
          status: 403,
          statusText: 'Forbidden',
          headers: {},
          config,
        },
        config,
      });
    };

    const path = '/repositories/knowledge-notes';

    const first = await client.get(path, { params: { limit: 20 } });
    const second = await client.get(path, { params: { limit: 20 } });
    const third = await client.get(path, { params: { limit: 20 } });
    const fourth = await client.get(path, { params: { limit: 20 } });

    expect(transportHits).toBe(2);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    expect(third.ok).toBe(false);
    expect(fourth.ok).toBe(false);

    if (!first.ok) {
      const ctx = first.error.context as { domainCode?: string } | undefined;
      expect(
        ctx?.domainCode === EMAIL_VERIFICATION_DOMAIN_CODE ||
          first.error.code === EMAIL_VERIFICATION_DOMAIN_CODE ||
          first.error.code === 'FORBIDDEN',
      ).toBe(true);
    }
    if (!third.ok) {
      const ctx = third.error.context as
        { shortCircuited?: boolean; domainCode?: string; messageKey?: string } | undefined;
      expect(
        ctx?.shortCircuited === true ||
          ctx?.domainCode === EMAIL_VERIFICATION_DOMAIN_CODE ||
          third.error.code === EMAIL_VERIFICATION_DOMAIN_CODE,
      ).toBe(true);
      expect(
        ctx?.messageKey === EMAIL_VERIFICATION_MESSAGE_KEY || third.error.message.length > 0,
      ).toBe(true);
    }

    // Storm simulation: 20 more loads must not re-fire transport
    for (let i = 0; i < 20; i++) {
      await client.get(path);
    }
    expect(transportHits).toBe(2);
    expect(isEmailVerificationCircuitTripped()).toBe(true);
  });

  it('resetEmailVerificationCircuit clears budget so later loads hit transport again', async () => {
    const client = new ResultHttpClient({ baseURL: 'http://localhost' });
    const axios = client.getAxiosInstance();
    let transportHits = 0;

    axios.defaults.adapter = async (config) => {
      transportHits += 1;
      throw Object.assign(new Error('Forbidden'), {
        response: {
          data: {
            ok: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Email verification is required before continuing.',
              context: { domainCode: EMAIL_VERIFICATION_DOMAIN_CODE },
            },
          },
          status: 403,
          statusText: 'Forbidden',
          headers: {},
          config,
        },
        config,
      });
    };

    const path = '/repositories/knowledge-notes';
    await client.get(path);
    await client.get(path);
    expect(transportHits).toBe(2);
    await client.get(path);
    expect(transportHits).toBe(2);

    resetEmailVerificationCircuit();
    expect(isEmailVerificationCircuitTripped()).toBe(false);

    await client.get(path);
    expect(transportHits).toBe(3);
  });

  it('does not fuse unrelated errors', async () => {
    const client = new ResultHttpClient({ baseURL: 'http://localhost' });
    const axios = client.getAxiosInstance();
    let transportHits = 0;

    axios.defaults.adapter = async (config) => {
      transportHits += 1;
      throw Object.assign(new Error('Not found'), {
        response: {
          data: { ok: false, error: { code: 'NOT_FOUND', message: 'missing' } },
          status: 404,
          statusText: 'Not Found',
          headers: {},
          config,
        },
        config,
      });
    };

    await client.get('/other');
    await client.get('/other');
    await client.get('/other');
    expect(transportHits).toBe(3);
    expect(isEmailVerificationCircuitTripped()).toBe(false);
  });
});
