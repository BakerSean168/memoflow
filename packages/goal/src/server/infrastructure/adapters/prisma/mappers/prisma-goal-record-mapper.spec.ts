import { describe, it, expect } from 'vitest';
import { aPrefixedUuid } from '@memoflow/test-utils/fixtures';
import { PrismaGoalRecordMapper } from './prisma-goal-record-mapper';

describe('PrismaGoalRecordMapper', () => {
  const RECORD_ID_1 = aPrefixedUuid('IGoalRecordId', 'goal-record-1');
  const RECORD_ID_2 = aPrefixedUuid('IGoalRecordId', 'goal-record-2');
  const KEY_RESULT_ID_1 = aPrefixedUuid('IKeyResultId', 'goal-record-kr-1');
  const KEY_RESULT_ID_2 = aPrefixedUuid('IKeyResultId', 'goal-record-kr-2');
  const IDENTITY_ID_1 = aPrefixedUuid('IdentityId', 'goal-record-owner-1');

  it('maps prisma row to domain goal record with defaults', () => {
    const row = {
      id: RECORD_ID_1,
      keyResultId: KEY_RESULT_ID_1,
      identityId: IDENTITY_ID_1,
      value: 42,
      authorship: 'Manual',
      sourceType: null,
      sourceId: null,
      note: null,
      recordedAt: new Date(1_500),
      createdAt: new Date(1_000),
      updatedAt: new Date(2_000),
    } as any;

    const domain = PrismaGoalRecordMapper.toDomain(row);
    const dto = domain.toServerDTO();

    expect(dto.id).toBe(RECORD_ID_1);
    expect(dto.keyResultId).toBe(KEY_RESULT_ID_1);
    expect(dto.note).toBeNull();
    expect(dto.recordedAt).toBe(1_500);
  });

  it('maps list and keeps nullable fields', () => {
    const rows = [
      {
        id: RECORD_ID_2,
        keyResultId: KEY_RESULT_ID_2,
        identityId: IDENTITY_ID_1,
        value: 8,
        authorship: 'Manual',
      sourceType: null,
      sourceId: null,
      note: 'good',
        recordedAt: new Date(2_500),
        createdAt: new Date(2_000),
        updatedAt: new Date(3_000),
      },
    ] as any[];

    const domains = PrismaGoalRecordMapper.toDomainList(rows);
    const dto = domains[0].toServerDTO();

    expect(domains).toHaveLength(1);
    expect(dto.note).toBe('good');
  });
});
