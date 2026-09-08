import { describe, expect, it } from 'vitest';
import { RetryPolicy } from '../retry-policy';

describe('RetryPolicy', () => {
  it('creates the documented defaults and computes exponential backoff', () => {
    const policy = RetryPolicy.createDefault();

    expect(policy.enabled).toBe(true);
    expect(policy.shouldRetry(2)).toBe(true);
    expect(policy.calculateNextRetryDelay(2)).toBe(20000);
  });

  it('caps retry delays and exposes formatted helpers', () => {
    const policy = RetryPolicy.create({
      enabled: true,
      maxRetries: 4,
      retryDelay: 5000,
      backoffMultiplier: 3,
      maxRetryDelay: 30000,
    });

    expect(policy.calculateNextRetryDelay(4)).toBe(30000);
    expect(policy.retryDelayFormatted).toBe('5 秒');
    expect(policy.maxRetryDelayFormatted).toBe('30 秒');
    expect(policy.policyDescription).toContain('最多重试 4 次');
  });

  it('supports disabled policies and validates enabled constraints', () => {
    const disabled = RetryPolicy.createDisabled().setEnabled(false);

    expect(disabled.shouldRetry(0)).toBe(false);
    expect(disabled.isDisabled).toBe(true);

    expect(() =>
      RetryPolicy.create({
        enabled: true,
        maxRetries: 0,
        retryDelay: 1000,
        backoffMultiplier: 1,
        maxRetryDelay: 1000,
      }),
    ).toThrow('maxRetries must be at least 1 when enabled');
  });
});
