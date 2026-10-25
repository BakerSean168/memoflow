import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  EmptyFailureDetailsSchema,
  FailureCategories,
  createPublicFailure,
  createPublicFailureSchema,
  defineFailureProjection,
  defineFailureRegistry,
  isJsonValue,
  isPublicFailure,
  strictFailureDetails,
  type FailureRegistry,
  type PublicFailureOf,
} from './index';

const AuthFailureRegistry = defineFailureRegistry({
  AUTH_INVALID_CREDENTIALS: {
    category: FailureCategories.Unauthenticated,
    details: EmptyFailureDetailsSchema,
    retryHint: { kind: 'not_retryable' },
    telemetry: 'invalid_credentials',
  },
  AUTH_RATE_LIMITED: {
    category: FailureCategories.RateLimited,
    details: strictFailureDetails({ retryAfterMs: z.number().int().nonnegative() }),
    retryHint: { kind: 'transient' },
    telemetry: 'rate_limited',
  },
  AUTH_PROVIDER_UNAVAILABLE: {
    category: FailureCategories.Unavailable,
    details: EmptyFailureDetailsSchema,
    retryHint: { kind: 'transient' },
    telemetry: 'provider_unavailable',
  },
});

type AuthFailure = PublicFailureOf<typeof AuthFailureRegistry>;

const AuthFailureSchema = createPublicFailureSchema(AuthFailureRegistry);

describe('public failure registry', () => {
  it('derives typed public failures and runtime schemas from one registry', () => {
    const failure: AuthFailure = createPublicFailure(
      AuthFailureRegistry,
      'AUTH_RATE_LIMITED',
      { retryAfterMs: 3_000 },
      { requestId: 'req-1', traceId: 'trace-1' },
    );

    expect(failure).toEqual({
      code: 'AUTH_RATE_LIMITED',
      category: 'rate_limited',
      details: { retryAfterMs: 3_000 },
      retryHint: { kind: 'transient' },
      reference: { requestId: 'req-1', traceId: 'trace-1' },
    });
    expect(AuthFailureSchema.parse(failure)).toEqual(failure);
    expect(isPublicFailure(failure)).toBe(true);
    expect(Object.isFrozen(AuthFailureRegistry)).toBe(true);
    expect(Object.isFrozen(AuthFailureRegistry.AUTH_RATE_LIMITED)).toBe(true);
    expect(Object.isFrozen(AuthFailureRegistry.AUTH_RATE_LIMITED.retryHint)).toBe(true);
  });

  it('rejects provider codes, unknown top-level fields, and retry-hint drift', () => {
    expect(() =>
      AuthFailureSchema.parse({
        code: 'BETTER_AUTH_RATE_LIMITED',
        category: 'rate_limited',
        details: { retryAfterMs: 3_000 },
      }),
    ).toThrow();

    expect(
      isPublicFailure({
        code: 'AUTH_PROVIDER_UNAVAILABLE',
        category: 'unavailable',
        details: {},
        providerCode: 'UPSTREAM_503',
      }),
    ).toBe(false);
    expect(
      isPublicFailure({
        code: 'AUTH_PROVIDER_UNAVAILABLE',
        category: 'unavailable',
        details: ['not-an-object'],
      }),
    ).toBe(false);

    expect(() =>
      AuthFailureSchema.parse({
        code: 'AUTH_INVALID_CREDENTIALS',
        category: 'unauthenticated',
        details: {},
        retryHint: { kind: 'transient' },
      }),
    ).toThrow();
  });

  it('rejects secret-like unknown detail fields instead of stripping them', () => {
    expect(() =>
      createPublicFailure(AuthFailureRegistry, 'AUTH_RATE_LIMITED', {
        retryAfterMs: 3_000,
        token: 'secret',
      } as never),
    ).toThrow();

    expect(() =>
      AuthFailureSchema.parse({
        code: 'AUTH_RATE_LIMITED',
        category: 'rate_limited',
        details: { retryAfterMs: 3_000, providerBody: { token: 'secret' } },
      }),
    ).toThrow();
  });

  it('rejects non-JSON detail outputs even when a Zod schema accepts them', () => {
    const UnsafeOutputRegistry = defineFailureRegistry({
      TEST_UNSAFE_OUTPUT: {
        category: FailureCategories.Internal,
        details: strictFailureDetails({ cause: z.unknown() }),
        telemetry: 'unsafe_output',
      },
    });
    const schema = createPublicFailureSchema(UnsafeOutputRegistry);

    expect(() =>
      createPublicFailure(UnsafeOutputRegistry, 'TEST_UNSAFE_OUTPUT', {
        cause: new Error('internal cause'),
      }),
    ).toThrow('not JSON-safe');
    expect(() =>
      schema.parse({
        code: 'TEST_UNSAFE_OUTPUT',
        category: 'internal',
        details: { cause: new Error('internal cause') },
      }),
    ).toThrow('JSON-safe');
  });

  it('rejects registries that bypass the strict details helper', () => {
    expect(() =>
      defineFailureRegistry({
        AUTH_UNSAFE: {
          category: 'internal',
          details: z.object({ providerBody: z.unknown() }),
          telemetry: 'unsafe',
        },
      } as unknown as FailureRegistry),
    ).toThrow('strictFailureDetails');
  });

  it('rejects unstable code names and empty telemetry labels', () => {
    expect(() =>
      defineFailureRegistry({
        betterAuthError: {
          category: 'internal',
          details: EmptyFailureDetailsSchema,
          telemetry: 'provider_error',
        },
      }),
    ).toThrow('uppercase snake case');

    expect(() =>
      defineFailureRegistry({
        AUTH_INTERNAL: {
          category: 'internal',
          details: EmptyFailureDetailsSchema,
          telemetry: '   ',
        },
      }),
    ).toThrow('must not be empty');
  });

  it('requires runtime projections to exactly cover registry codes', () => {
    const projection = defineFailureProjection(AuthFailureRegistry, {
      AUTH_INVALID_CREDENTIALS: 'auth.errors.invalidCredentials',
      AUTH_RATE_LIMITED: 'auth.errors.rateLimited',
      AUTH_PROVIDER_UNAVAILABLE: 'auth.errors.providerUnavailable',
    });
    expect(Object.keys(projection)).toHaveLength(3);

    expect(() =>
      defineFailureProjection(AuthFailureRegistry, {
        AUTH_INVALID_CREDENTIALS: 'auth.errors.invalidCredentials',
        AUTH_RATE_LIMITED: 'auth.errors.rateLimited',
        AUTH_PROVIDER_UNAVAILABLE: 'auth.errors.providerUnavailable',
        AUTH_EXTRA: 'auth.errors.extra',
      } as never),
    ).toThrow('exactly match');
  });
});

describe('JSON-safe public failure values', () => {
  it('accepts serializable values and rejects diagnostic objects', () => {
    expect(isJsonValue({ reason: 'conflict', versions: [1, 2], nested: { ok: true } })).toBe(true);
    expect(isJsonValue(new Error('private cause'))).toBe(false);
    expect(isJsonValue(new Date())).toBe(false);
    expect(isJsonValue(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isJsonValue(() => undefined)).toBe(false);
    expect(isJsonValue(new Map([['key', 'value']]))).toBe(false);
  });
});
