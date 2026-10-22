import { expect, it } from 'vitest';
import { z } from 'zod';
import { errorResponse, successResponse } from './openapi-helpers';

it('builds response descriptions with executable success/error envelope schemas', () => {
  const success = successResponse(z.object({ id: z.string() }), 'ok');
  const error = errorResponse('missing');
  expect(success.description).toBe('ok');
  expect(error.description).toBe('missing');
  const successSchema = success.content['application/json'].schema;
  const errorSchema = error.content['application/json'].schema;
  const envelope = { code: 200, message: 'ok', timestamp: 1 };
  expect(successSchema.safeParse({ ...envelope, ok: true, data: { id: 'one' } }).success).toBe(true);
  expect(successSchema.safeParse({ ...envelope, ok: true, data: { id: null } }).success).toBe(false);
  const failure = { ...envelope, ok: false, error: { code: 'NOT_FOUND', message: 'missing' } };
  expect(errorSchema.safeParse(failure).success).toBe(true);
  expect(successSchema.safeParse(failure).success).toBe(false);
});
