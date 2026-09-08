import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanAll, disconnectPrisma, getPrisma, seedAccount } from '@memoflow/test-utils/setup/integration-helpers'
import { LabelService } from '../application/label-service'
import { PrismaLabelRepository } from '../infrastructure/prisma/prisma-label.repository'

async function seedGoalAndTask(identityId: string, suffix: string) {
  const prisma = await getPrisma()
  const goalId = `goal-${suffix}`
  const taskTemplateId = `task-${suffix}`
  await prisma.goal.create({ data: { id: goalId, identityId, name: `Goal ${suffix}` } })
  await prisma.taskTemplate.create({
    data: { id: taskTemplateId, identityId, name: `Task ${suffix}`, status: 'Active' },
  })
  return { goalId, taskTemplateId }
}

describe('PrismaLabelRepository integration', () => {
  afterAll(async () => {
    await cleanAll()
    await disconnectPrisma()
  })

  beforeEach(async () => {
    await cleanAll()
  })

  it('shares one identity-owned label across Goal and Task and supports AND filtering', async () => {
    const identityId = 'label-int-primary'
    await seedAccount({ id: identityId })
    const { goalId, taskTemplateId } = await seedGoalAndTask(identityId, 'primary')
    const repository = new PrismaLabelRepository(await getPrisma())
    let nextId = 0
    const service = new LabelService(repository, { idFactory: () => `label-${++nextId}` })

    const work = await service.create({ identityId, name: '#工作' })
    const deep = await service.create({ identityId, name: 'Deep Work' })

    await service.setGoalLabels({ identityId, goalId, labelIds: [work.id, deep.id] })
    await service.setTaskLabels({ identityId, taskTemplateId, labelIds: [work.id, deep.id] })

    expect(await repository.listGoalLabels(identityId, goalId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: work.id }), expect.objectContaining({ id: deep.id })]),
    )
    expect(await repository.listTaskLabels(identityId, taskTemplateId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: work.id }), expect.objectContaining({ id: deep.id })]),
    )
    expect(await repository.findGoalIdsMatchingAllLabels(identityId, [work.id, deep.id])).toEqual([goalId])
    expect(await repository.findTaskTemplateIdsMatchingAllLabels(identityId, [work.id, deep.id])).toEqual([taskTemplateId])
    const goalBatch = await repository.listGoalLabelsByGoalIds(identityId, [goalId])
    const taskBatch = await repository.listTaskLabelsByTaskTemplateIds(identityId, [taskTemplateId])
    expect(goalBatch.get(goalId)?.map((label) => label.id).sort()).toEqual([deep.id, work.id].sort())
    expect(taskBatch.get(taskTemplateId)?.map((label) => label.id).sort()).toEqual([deep.id, work.id].sort())
  })

  it('enforces normalized identity-scoped uniqueness in the database', async () => {
    const identityId = 'label-int-normalization'
    await seedAccount({ id: identityId })
    const repository = new PrismaLabelRepository(await getPrisma())
    let nextId = 0
    const service = new LabelService(repository, { idFactory: () => `label-norm-${++nextId}` })

    await service.create({ identityId, name: '  ＷＯＲＫ  ' })
    await expect(service.create({ identityId, name: 'work' })).rejects.toThrow()
  })

  it('rejects cross-identity label assignment atomically', async () => {
    const ownerIdentity = 'label-int-owner'
    const foreignIdentity = 'label-int-foreign'
    await seedAccount({ id: ownerIdentity })
    await seedAccount({ id: foreignIdentity })
    const { goalId } = await seedGoalAndTask(ownerIdentity, 'owner')
    const repository = new PrismaLabelRepository(await getPrisma())
    const foreignService = new LabelService(repository, { idFactory: () => 'label-foreign' })
    const foreign = await foreignService.create({ identityId: foreignIdentity, name: 'Foreign' })

    await expect(
      repository.replaceGoalLabels(ownerIdentity, goalId, [foreign.id]),
    ).rejects.toThrow('do not belong to the identity')
    expect(await repository.listGoalLabels(ownerIdentity, goalId)).toEqual([])
  })
})
