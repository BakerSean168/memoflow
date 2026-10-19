import { expect, it } from 'vitest';
import {
  AssistedHandleSchema,
  AssistedMutationHandleSchema,
  AssistedResumeSchema,
  AssistedStartSchema,
} from './assisted';

it('requires explicit pinned provider/model fee consent and a canonical review token, never approved:true', () => {
  const start = { idempotencyKey: 'retry', kind: 'task.create', input: { idea: 'Ship report' } };
  expect(AssistedStartSchema.safeParse(start).success).toBe(false);
  expect(AssistedStartSchema.safeParse({ ...start, consent: {
    providerId: 'owned-provider', providerVersion: 1, modelId: 'selected-model', acceptFees: true,
  } }).success).toBe(true);
  expect(AssistedResumeSchema.safeParse({
    handle: '556ee251-311c-450d-a479-d9f802cc1e60', expectedRevision: 1, approved: true,
  }).success).toBe(false);
  const handle = '556ee251-311c-450d-a479-d9f802cc1e60';
  expect(AssistedHandleSchema.safeParse({ handle }).success).toBe(true);
  expect(AssistedMutationHandleSchema.safeParse({ handle }).success).toBe(false);
});
