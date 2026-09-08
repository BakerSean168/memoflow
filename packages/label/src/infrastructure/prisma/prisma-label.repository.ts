import type { PrismaClient } from '@memoflow/database'
import type { LabelRecord, NewLabelRecord } from '../../domain/label'
import type { LabelListOptions, LabelRepository } from '../../domain/label-repository'

type Db = Pick<
  PrismaClient,
  'label' | 'goalLabel' | 'taskLabel' | 'goal' | 'taskPlan' | '$transaction'
>

type LabelRow = Awaited<ReturnType<Db['label']['findFirst']>>

export class PrismaLabelRepository implements LabelRepository {
  constructor(private readonly db: Db) {}

  async create(record: NewLabelRecord): Promise<LabelRecord> {
    const row = await this.db.label.create({
      data: {
        id: record.id,
        identityId: record.identityId,
        name: record.name,
        normalizedName: record.normalizedName,
        color: record.color,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      },
    })
    return toRecord(row)
  }

  async update(input: {
    identityId: string
    labelId: string
    name?: string
    normalizedName?: string
    color?: string | null
  }): Promise<LabelRecord | null> {
    const existing = await this.db.label.findFirst({
      where: { id: input.labelId, identityId: input.identityId },
      select: { id: true },
    })
    if (!existing) return null
    const row = await this.db.label.update({
      where: { id: input.labelId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.normalizedName !== undefined ? { normalizedName: input.normalizedName } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      },
    })
    return toRecord(row)
  }

  async delete(identityId: string, labelId: string): Promise<boolean> {
    const result = await this.db.label.deleteMany({ where: { id: labelId, identityId } })
    return result.count > 0
  }

  async findById(identityId: string, labelId: string): Promise<LabelRecord | null> {
    const row = await this.db.label.findFirst({ where: { id: labelId, identityId } })
    return row ? toRecord(row) : null
  }

  async list(options: LabelListOptions): Promise<LabelRecord[]> {
    const rows = await this.db.label.findMany({
      where: {
        identityId: options.identityId,
        ...(options.normalizedSearch
          ? { normalizedName: { contains: options.normalizedSearch } }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(options.limit ?? 100, 1), 500),
    })
    return rows.map(toRecord)
  }

  async replaceGoalLabels(identityId: string, goalId: string, labelIds: readonly string[]): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await ensureOwnerAndLabels(tx, 'goal', identityId, goalId, labelIds)
      await tx.goalLabel.deleteMany({ where: { identityId, goalId } })
      if (labelIds.length) {
        await tx.goalLabel.createMany({
          data: labelIds.map((labelId) => ({ identityId, goalId, labelId })),
        })
      }
    })
  }

  async replaceTaskLabels(
    identityId: string,
    taskPlanId: string,
    labelIds: readonly string[],
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await ensureOwnerAndLabels(tx, 'task', identityId, taskPlanId, labelIds)
      await tx.taskLabel.deleteMany({ where: { identityId, taskPlanId } })
      if (labelIds.length) {
        await tx.taskLabel.createMany({
          data: labelIds.map((labelId) => ({ identityId, taskPlanId, labelId })),
        })
      }
    })
  }

  async listGoalLabels(identityId: string, goalId: string): Promise<LabelRecord[]> {
    const links = await this.db.goalLabel.findMany({
      where: { identityId, goalId },
      include: { label: true },
      orderBy: { label: { name: 'asc' } },
    })
    return links.map(({ label }) => toRecord(label))
  }

  async listTaskLabels(identityId: string, taskPlanId: string): Promise<LabelRecord[]> {
    const links = await this.db.taskLabel.findMany({
      where: { identityId, taskPlanId },
      include: { label: true },
      orderBy: { label: { name: 'asc' } },
    })
    return links.map(({ label }) => toRecord(label))
  }

  async listGoalLabelsByGoalIds(
    identityId: string,
    goalIds: readonly string[],
  ): Promise<Map<string, LabelRecord[]>> {
    const ids = [...new Set(goalIds)]
    const result = new Map(ids.map((id) => [id, [] as LabelRecord[]]))
    if (!ids.length) return result
    const links = await this.db.goalLabel.findMany({
      where: { identityId, goalId: { in: ids } },
      include: { label: true },
      orderBy: [{ goalId: 'asc' }, { label: { name: 'asc' } }],
    })
    for (const { goalId, label } of links) result.get(goalId)?.push(toRecord(label))
    return result
  }

  async listTaskLabelsByTaskPlanIds(
    identityId: string,
    taskPlanIds: readonly string[],
  ): Promise<Map<string, LabelRecord[]>> {
    const ids = [...new Set(taskPlanIds)]
    const result = new Map(ids.map((id) => [id, [] as LabelRecord[]]))
    if (!ids.length) return result
    const links = await this.db.taskLabel.findMany({
      where: { identityId, taskPlanId: { in: ids } },
      include: { label: true },
      orderBy: [{ taskPlanId: 'asc' }, { label: { name: 'asc' } }],
    })
    for (const { taskPlanId, label } of links) result.get(taskPlanId)?.push(toRecord(label))
    return result
  }

  async findGoalIdsMatchingAllLabels(identityId: string, labelIds: readonly string[]): Promise<string[]> {
    return allMatches(
      await this.db.goalLabel.findMany({
        where: { identityId, labelId: { in: [...new Set(labelIds)] } },
        select: { goalId: true, labelId: true },
      }),
      [...new Set(labelIds)],
      (row) => row.goalId,
    )
  }

  async findTaskPlanIdsMatchingAllLabels(
    identityId: string,
    labelIds: readonly string[],
  ): Promise<string[]> {
    return allMatches(
      await this.db.taskLabel.findMany({
        where: { identityId, labelId: { in: [...new Set(labelIds)] } },
        select: { taskPlanId: true, labelId: true },
      }),
      [...new Set(labelIds)],
      (row) => row.taskPlanId,
    )
  }
}

function toRecord(row: NonNullable<LabelRow>): LabelRecord {
  return {
    id: row.id,
    identityId: row.identityId,
    name: row.name,
    normalizedName: row.normalizedName,
    color: row.color,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

async function ensureOwnerAndLabels(
  tx: Parameters<Parameters<Db['$transaction']>[0]>[0],
  ownerType: 'goal' | 'task',
  identityId: string,
  ownerId: string,
  labelIds: readonly string[],
): Promise<void> {
  const owner = ownerType === 'goal'
    ? await tx.goal.findFirst({ where: { id: ownerId, identityId }, select: { id: true } })
    : await tx.taskPlan.findFirst({ where: { id: ownerId, identityId }, select: { id: true } })
  if (!owner) throw new Error(`${ownerType === 'goal' ? 'Goal' : 'Task template'} not found.`)

  const uniqueIds = [...new Set(labelIds)]
  if (!uniqueIds.length) return
  const count = await tx.label.count({ where: { identityId, id: { in: uniqueIds } } })
  if (count !== uniqueIds.length) throw new Error('One or more labels do not belong to the identity.')
}

function allMatches<T extends { labelId: string }>(
  rows: readonly T[],
  labelIds: readonly string[],
  ownerId: (row: T) => string,
): string[] {
  if (!labelIds.length) return []
  const required = new Set(labelIds)
  const matches = new Map<string, Set<string>>()
  for (const row of rows) {
    const id = ownerId(row)
    const found = matches.get(id) ?? new Set<string>()
    found.add(row.labelId)
    matches.set(id, found)
  }
  return [...matches.entries()]
    .filter(([, found]) => [...required].every((labelId) => found.has(labelId)))
    .map(([id]) => id)
    .sort()
}
