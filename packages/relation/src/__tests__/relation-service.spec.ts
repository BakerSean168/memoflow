import { describe, expect, it, vi } from 'vitest';
import { SubjectRefSchema } from '@memoflow/contracts/relation';
import type { RelationRepository } from '../domain/relation-repository';
import { RelationService } from '../application/relation-service';

const GOAL_REF = SubjectRefSchema.parse({
  type: 'goal',
  id: 'IGoalId_550e8400-e29b-41d4-a716-446655440000',
});
const NOTE_REF = SubjectRefSchema.parse({
  type: 'note',
  id: 'kdoc_550e8400-e29b-41d4-a716-446655440090',
});

function repository(): RelationRepository {
  return {
    add: vi.fn(async (input) => ({
      id: 'relation-1',
      subject: input.subject,
      relationType: input.relationType,
      object: input.object,
      createdAt: 1,
    })),
    deleteById: vi.fn(async () => true),
    deleteExact: vi.fn(async () => true),
    deleteAllForEntity: vi.fn(async () => 1),
    findBySubject: vi.fn(async () => []),
    findByObject: vi.fn(async () => []),
  };
}

describe('RelationService', () => {
  it('rejects path-derived note ids before persistence', async () => {
    const repo = repository();
    const service = new RelationService(repo);
    expect(() =>
      service.add('identity-1', {
        subject: GOAL_REF,
        relationType: 'related',
        object: { type: 'note', id: 'notes/interview.md' as never },
      }),
    ).toThrow();
    expect(repo.add).not.toHaveBeenCalled();
  });

  it('preserves the stable note id and identity ownership', async () => {
    const repo = repository();
    const service = new RelationService(repo);
    await service.add('identity-1', {
      subject: GOAL_REF,
      relationType: 'related',
      object: NOTE_REF,
    });
    expect(repo.add).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-1', object: NOTE_REF }),
    );
  });
});
