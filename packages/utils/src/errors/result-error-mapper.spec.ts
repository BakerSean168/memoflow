import { describe, expect, it, vi } from 'vitest';
import {
  EmptyFailureDetailsSchema,
  FailureCategories,
  ResultErrorException,
  createPublicFailure,
  defineFailureRegistry,
  toLegacyResultError,
} from '@memoflow/transport-contracts/result';
import type { ILogger } from '../logger/types';
import { recordDiagnosticFailure } from './diagnostic-failure';
import { mapInfraErrorToFailure, mapInfraErrorToResultError } from './result-error-mapper';

const TestFailureRegistry = defineFailureRegistry({
  TEST_PROVIDER_UNAVAILABLE: {
    category: FailureCategories.Unavailable,
    details: EmptyFailureDetailsSchema,
    retryHint: { kind: 'transient' },
    telemetry: 'provider_unavailable',
  },
});

function loggerMock(): ILogger {
  return {
    context: 'spec',
    debug: vi.fn(),
    info: vi.fn(),
    http: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
}

describe('mapInfraErrorToFailure', () => {
  it('separates an unknown cause from the public error', () => {
    const cause = new Error('database password leaked in provider message');
    const mapped = mapInfraErrorToFailure(cause, 'Operation failed safely', 'task.create');

    expect(mapped.publicError).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Operation failed safely',
      statusCode: 500,
    });
    expect(mapped.publicError).not.toHaveProperty('cause');
    expect(mapped.diagnostic).toEqual(expect.objectContaining({ operation: 'task.create', cause }));
  });

  it('preserves a typed public failure while keeping its cause internal', () => {
    const failure = createPublicFailure(TestFailureRegistry, 'TEST_PROVIDER_UNAVAILABLE', {});
    const cause = new Error('upstream TLS diagnostics');
    const legacy = toLegacyResultError(failure, 'Provider unavailable');
    const mapped = mapInfraErrorToFailure(
      new ResultErrorException(
        legacy.message,
        legacy.code,
        legacy.details,
        legacy.context,
        503,
        cause,
        failure,
      ),
      'Operation failed',
      'provider.load',
    );

    expect(mapped.publicError).toEqual({
      code: 'TEST_PROVIDER_UNAVAILABLE',
      message: 'Provider unavailable',
      details: undefined,
      context: undefined,
      failure,
      statusCode: 503,
    });
    expect(mapped.publicError).not.toHaveProperty('cause');
    expect(mapped.diagnostic).toEqual(
      expect.objectContaining({ operation: 'provider.load', cause }),
    );
  });

  it('keeps Prisma implementation details in diagnostics', () => {
    const prisma = Object.assign(new Error('Unique constraint on secret field'), {
      code: 'P2002',
    });
    const mapped = mapInfraErrorToFailure(prisma, 'Failed', 'account.create');

    expect(mapped.publicError).toEqual({
      code: 'CONFLICT',
      message: 'Resource already exists',
      statusCode: 409,
    });
    expect(mapped.diagnostic).toEqual(
      expect.objectContaining({
        operation: 'account.create',
        cause: prisma,
        provider: 'prisma',
        providerCode: 'P2002',
      }),
    );
  });

  it('keeps the legacy mapper behavior for unmigrated callers', () => {
    const cause = new Error('legacy cause');
    const mapped = mapInfraErrorToResultError(cause, 'Safe failure');

    expect(mapped).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Safe failure',
      statusCode: 500,
      cause,
    });
  });
});

describe('recordDiagnosticFailure', () => {
  it('records provider diagnostics through the owning logger only', () => {
    const logger = loggerMock();
    const cause = new Error('provider body');

    recordDiagnosticFailure(logger, {
      operation: 'repository.connect',
      cause,
      provider: 'github',
      providerCode: 'INSTALLATION_SUSPENDED',
      attributes: {
        attempt: 2,
        operation: 'malicious.override',
        provider: 'malicious-provider',
        providerCode: 'MALICIOUS_CODE',
      },
    });

    expect(logger.error).toHaveBeenCalledWith('Operation failed: repository.connect', cause, {
      attempt: 2,
      operation: 'repository.connect',
      provider: 'github',
      providerCode: 'INSTALLATION_SUSPENDED',
    });
  });
});
