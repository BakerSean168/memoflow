import { describe, it, expect } from 'vitest';
import { PrismaWeightSnapshotMapper } from './prisma-weight-snapshot-mapper';
import { KeyResultWeightSnapshot } from '../../../../domain';
import type { SnapshotTrigger } from '@memoflow/goal-contracts';

describe('PrismaWeightSnapshotMapper', () => {
  const domainSnapshot = new KeyResultWeightSnapshot(
    'snap-1',
    'goal-1',
    'kr-1',
    'test-identity-id' as any,
    10,
    20,
    1234567890,
    'manual' as SnapshotTrigger,
    'user-1',
    'reason',
    1234567800,
  );

  it('should map toPrisma correctly', () => {
    const prismaData = PrismaWeightSnapshotMapper.toPrisma(domainSnapshot);

    expect(prismaData.id).toBe('snap-1');
    expect(prismaData.snapshotTime).toEqual(new Date(1234567890));
    expect(prismaData.reason).toBe('reason');
    expect(prismaData.createdAt).toBeInstanceOf(Date);
    expect(prismaData.createdAt.getTime()).toBe(1234567800);
  });

  it('should map toDomain correctly', () => {
    const prismaData = {
      id: 'snap-1',
      goalId: 'goal-1',
      keyResultId: 'kr-1',
      identityId: 'test-identity-id',
      oldWeight: 10,
      newWeight: 20,
      weightDelta: 10,
      snapshotTime: BigInt(1234567890),
      trigger: 'manual',
      reason: 'reason',
      operatorId: 'user-1',
      createdAt: new Date(1234567800),
    };

    const domain = PrismaWeightSnapshotMapper.toDomain(prismaData);

    expect(domain).toBeInstanceOf(KeyResultWeightSnapshot);
    expect(domain.id).toBe('snap-1');
    expect(domain.snapshotTime).toBe(1234567890);
    expect(domain.reason).toBe('reason');
    expect(domain.createdAt).toBe(1234567800);
  });
});
