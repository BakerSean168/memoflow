import { describe, expect, it, vi } from 'vitest'
import type { LabelRepository } from '../domain/label-repository'
import { LabelService } from '../application/label-service'
import { normalizeLabelName, validateLabelName } from '../domain/label'

function repositoryMock(): LabelRepository {
  return {
    create: vi.fn(async (record) => record),
    update: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(async () => []),
    replaceGoalLabels: vi.fn(async () => undefined),
    replaceTaskLabels: vi.fn(async () => undefined),
    listGoalLabels: vi.fn(async () => []),
    listTaskLabels: vi.fn(async () => []),
    listGoalLabelsByGoalIds: vi.fn(async () => new Map()),
    listTaskLabelsByTaskTemplateIds: vi.fn(async () => new Map()),
    findGoalIdsMatchingAllLabels: vi.fn(async () => []),
    findTaskTemplateIdsMatchingAllLabels: vi.fn(async () => []),
  }
}

describe('shared label semantics', () => {
  it('normalizes with trim + Unicode NFKC + case folding without slug rewriting', () => {
    expect(normalizeLabelName('  ＷＯＲＫ 项目  ')).toBe('work 项目')
    expect(normalizeLabelName('High Priority')).toBe('high priority')
  })

  it('rejects empty or oversized names', () => {
    expect(() => validateLabelName('   ')).toThrow('must not be empty')
    expect(() => validateLabelName('x'.repeat(51))).toThrow('at most 50')
  })

  it('resolves AI-proposed label names onto canonical identity-owned labels', async () => {
    const repository = repositoryMock()
    vi.mocked(repository.list).mockResolvedValue([
      {
        id: 'label-work',
        identityId: 'identity-1',
        name: 'Work',
        normalizedName: 'work',
        color: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    const service = new LabelService(repository, { now: () => 123, idFactory: () => 'label-health' })

    const resolved = await service.resolveNames('identity-1', ['  WORK ', 'Health', 'health'])

    expect(resolved.map((label) => [label.id, label.name])).toEqual([
      ['label-work', 'Work'],
      ['label-health', 'Health'],
    ])
    expect(repository.create).toHaveBeenCalledTimes(1)
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'label-health',
        identityId: 'identity-1',
        name: 'Health',
        normalizedName: 'health',
      }),
    )
  })

  it('deduplicates labelIds before replacing Goal and Task assignments', async () => {
    const repository = repositoryMock()
    const service = new LabelService(repository, {
      now: () => 123,
      idFactory: () => 'label-1',
    })

    const created = await service.create({ identityId: 'identity-1', name: '  Work  ' })
    await service.setGoalLabels({ identityId: 'identity-1', goalId: 'goal-1', labelIds: ['label-1', 'label-1'] })
    await service.setTaskLabels({ identityId: 'identity-1', taskTemplateId: 'task-1', labelIds: ['label-1', 'label-1'] })

    expect(created).toMatchObject({ id: 'label-1', name: 'Work', normalizedName: 'work' })
    expect(repository.replaceGoalLabels).toHaveBeenCalledWith('identity-1', 'goal-1', ['label-1'])
    expect(repository.replaceTaskLabels).toHaveBeenCalledWith('identity-1', 'task-1', ['label-1'])
  })
})
