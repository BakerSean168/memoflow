import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@memoflow/database';
import { PrismaAccountClosureOperationRepository } from '../account-closure-operation-prisma.repository';
import { IdentityId } from '@memoflow/utils/domain';

describe('PrismaAccountClosureOperationRepository Integration Test', () => {
  const repo = new PrismaAccountClosureOperationRepository(prisma);

  it('should support identity-bound creation, lookups, and CAS phase updates', async () => {
    const identityId = IdentityId.generate().toString();
    const idempotencyKey = `cas-test-${Date.now()}`;

    const record = {
      id: crypto.randomUUID(),
      identityId,
      idempotencyKey,
      phase: 'requested' as const,
      status: 'running' as const,
      attempts: 1,
      version: 1,
      ownerToken: null,
      leaseExpiresAt: null,
      nextRetryAt: null,
      deadLetterAt: null,
      eventId: null,
      reason: 'Integration Test Reason',
      revokedSessions: 0,
      piiCleanupStatus: null,
      lastError: null,
      receiptJson: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      finishedAt: null,
    };

    // 1. Initial atomic creation
    const created = await repo.create(record);
    expect(created).toBe(true);

    // 2. Duplicate atomic creation for same (identityId, idempotencyKey) returns false
    const createdDuplicate = await repo.create(record);
    expect(createdDuplicate).toBe(false);

    // 3. Lookup by identityId and idempotencyKey
    const found = await repo.findByIdentityAndIdempotencyKey(identityId, idempotencyKey);
    expect(found).not.toBeNull();
    expect(found?.identityId).toBe(identityId);
    expect(found?.phase).toBe('requested');

    // 4. CAS phase transition: expectedPhase 'requested' -> 'revoking' succeeds
    const okCAS = await repo.updatePhaseCAS({
      id: record.id,
      identityId,
      expectedPhase: 'requested',
      newPhase: 'revoking',
    });
    expect(okCAS).toBe(true);

    // 5. CAS phase transition with mismatched expectedPhase returns false
    const staleCAS = await repo.updatePhaseCAS({
      id: record.id,
      identityId,
      expectedPhase: 'requested', // phase is now 'revoking'
      newPhase: 'revoked',
    });
    expect(staleCAS).toBe(false);

    // 6. Active operation query
    const active = await repo.findActiveByIdentityId(identityId);
    expect(active).not.toBeNull();
    expect(active?.phase).toBe('revoking');
  });

  it('should isolate idempotency keys between different identities in Prisma', async () => {
    const key = `shared-key-${Date.now()}`;
    const user1 = IdentityId.generate().toString();
    const user2 = IdentityId.generate().toString();

    const rec1 = {
      id: crypto.randomUUID(),
      identityId: user1,
      idempotencyKey: key,
      phase: 'requested' as const,
      status: 'running' as const,
      attempts: 1,
      version: 1,
      ownerToken: null,
      leaseExpiresAt: null,
      nextRetryAt: null,
      deadLetterAt: null,
      eventId: null,
      reason: 'User 1',
      revokedSessions: 0,
      piiCleanupStatus: null,
      lastError: null,
      receiptJson: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      finishedAt: null,
    };

    const rec2 = {
      ...rec1,
      id: crypto.randomUUID(),
      identityId: user2,
      reason: 'User 2',
    };

    const created1 = await repo.create(rec1);
    const created2 = await repo.create(rec2);

    expect(created1).toBe(true);
    expect(created2).toBe(true);

    const found1 = await repo.findByIdentityAndIdempotencyKey(user1, key);
    const found2 = await repo.findByIdentityAndIdempotencyKey(user2, key);

    expect(found1?.identityId).toBe(user1);
    expect(found2?.identityId).toBe(user2);
    expect(found1?.id).not.toBe(found2?.id);
  });
});
