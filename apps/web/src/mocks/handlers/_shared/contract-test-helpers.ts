import { ok, type Result } from '@memoflow/transport-contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { z } from 'zod';
import { expect, vi } from 'vitest';

export type HttpSpy = IResultHttpClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
  getAxiosInstance: ReturnType<typeof vi.fn>;
};

export function successResult<T>(data: T): Result<T> {
  return ok(data);
}

export function createHttpClientSpy(): HttpSpy {
  return {
    get: vi.fn(async () => successResult(null)),
    post: vi.fn(async () => successResult(null)),
    put: vi.fn(async () => successResult(null)),
    patch: vi.fn(async () => successResult(null)),
    delete: vi.fn(async () => successResult(null)),
    request: vi.fn(async () => successResult(null)),
    getAxiosInstance: vi.fn(() => ({})),
  } as HttpSpy;
}

export function expectSchemaSuccess<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(value);
  expect(result.success).toBe(true);

  if (!result.success) {
    throw new Error(JSON.stringify(result.error.issues));
  }

  return result.data;
}

export function expectSchemaFailure<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): void {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
}
