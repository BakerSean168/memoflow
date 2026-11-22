import { afterAll, beforeEach, expect, it } from 'vitest';
import {
  createExternalAgentAuditQuery,
  createExternalAgentAuditStore,
  prisma,
} from '@memoflow/database';
import { IdentityId } from '@memoflow/utils/domain';
import {
  cleanAll,
  disconnectPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';

beforeEach(cleanAll);
afterAll(disconnectPrisma);

const record = (identityId: string, credentialId: string, requestId: string) => ({
  identityId,
  credentialId,
  effect: 'write',
  tool: 'goal_create',
  outcome: 'OK',
  scopeDecision: 'allowed',
  requestId,
  traceId: 'trace-a',
  receiptId: `receipt-${requestId}`,
  durationMs: 7,
});

it('persists a flushed batch and answers credential, request and time filters', async () => {
  const a = String(IdentityId.generate());
  const b = String(IdentityId.generate());
  await seedAccount({ id: a });
  await seedAccount({ id: b });
  const store = createExternalAgentAuditStore(prisma, { batchSize: 100, flushDelayMs: 10_000 });
  store.record(record(a, 'credential-a', 'request-a'));
  store.record(record(a, 'credential-a', 'request-b'));
  store.record(record(b, 'credential-b', 'request-b'));
  await store.flush();

  const query = createExternalAgentAuditQuery(prisma);
  const byCredential = await query.list(a, { credentialId: 'credential-a' });
  expect(byCredential.items).toHaveLength(2);
  expect(new Set(byCredential.items.map((item) => item.requestId))).toEqual(
    new Set(['request-a', 'request-b']),
  );

  const byRequest = await query.list(a, { requestId: 'request-b' });
  expect(byRequest.items).toHaveLength(1);
  expect(byRequest.items[0]).toMatchObject({ identityId: a, receiptId: 'receipt-request-b' });

  const byTime = await query.list(a, {
    from: new Date(Date.now() - 60_000),
    to: new Date(Date.now() + 60_000),
  });
  expect(byTime.items).toHaveLength(2);
  const outside = await query.list(a, {
    from: new Date('2020-01-01T00:00:00.000Z'),
    to: new Date('2020-01-02T00:00:00.000Z'),
  });
  expect(outside.items).toHaveLength(0);

  await store.close();
});

it('persists OAuth credential provenance for write audit rows', async () => {
  const a = String(IdentityId.generate());
  await seedAccount({ id: a });
  const store = createExternalAgentAuditStore(prisma, { batchSize: 100, flushDelayMs: 10_000 });
  store.record({
    ...record(a, 'connection-a', 'request-oauth'),
    credentialType: 'oauth',
    clientId: 'https://client.example.test/meta',
    consentScopesHash: 'a'.repeat(64),
  });
  await store.flush();
  const page = await createExternalAgentAuditQuery(prisma).list(a, {
    credentialId: 'connection-a',
  });
  expect(page.items[0]).toMatchObject({
    credentialType: 'oauth',
    clientId: 'https://client.example.test/meta',
    consentScopesHash: 'a'.repeat(64),
    effect: 'write',
  });
  await store.close();
});

it('never returns another owner rows for a shared request or credential filter', async () => {
  const a = String(IdentityId.generate());
  const b = String(IdentityId.generate());
  await seedAccount({ id: a });
  await seedAccount({ id: b });
  const store = createExternalAgentAuditStore(prisma, { batchSize: 100, flushDelayMs: 10_000 });
  store.record(record(b, 'credential-b', 'shared-request'));
  await store.flush();
  const query = createExternalAgentAuditQuery(prisma);
  expect((await query.list(a, { requestId: 'shared-request' })).items).toHaveLength(0);
  expect((await query.list(a, { credentialId: 'credential-b' })).items).toHaveLength(0);
  expect((await query.list(b, { requestId: 'shared-request' })).items).toHaveLength(1);
  await store.close();
});
