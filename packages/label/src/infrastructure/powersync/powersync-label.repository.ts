import type { IElectronDatabase } from '@memoflow/contracts/electron'
import type { LabelRecord, NewLabelRecord } from '../../domain/label'
import type { LabelListOptions, LabelRepository } from '../../domain/label-repository'

interface LabelRow {
  id: string
  identity_id: string
  name: string
  normalized_name: string
  color: string | null
  created_at: string
  updated_at: string
}

export class PowerSyncLabelRepository implements LabelRepository {
  constructor(private readonly db: IElectronDatabase) {}

  async create(record: NewLabelRecord): Promise<LabelRecord> {
    await this.db.execute(
      `INSERT INTO labels (id, identity_id, name, normalized_name, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.identityId, record.name, record.normalizedName, record.color,
        new Date(record.createdAt).toISOString(), new Date(record.updatedAt).toISOString()],
    )
    return record
  }

  async update(input: {
    identityId: string
    labelId: string
    name?: string
    normalizedName?: string
    color?: string | null
  }): Promise<LabelRecord | null> {
    const current = await this.findById(input.identityId, input.labelId)
    if (!current) return null
    const next = {
      ...current,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.normalizedName !== undefined ? { normalizedName: input.normalizedName } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      updatedAt: Date.now(),
    }
    await this.db.execute(
      `UPDATE labels SET name = ?, normalized_name = ?, color = ?, updated_at = ?
       WHERE id = ? AND identity_id = ?`,
      [next.name, next.normalizedName, next.color, new Date(next.updatedAt).toISOString(),
        input.labelId, input.identityId],
    )
    return next
  }

  async delete(identityId: string, labelId: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM labels WHERE id = ? AND identity_id = ?', [labelId, identityId])
    return Number(result.rowsAffected ?? 0) > 0
  }

  async findById(identityId: string, labelId: string): Promise<LabelRecord | null> {
    const row = await this.db.getOptional<LabelRow>(
      'SELECT * FROM labels WHERE id = ? AND identity_id = ? LIMIT 1',
      [labelId, identityId],
    )
    return row ? fromRow(row) : null
  }

  async list(options: LabelListOptions): Promise<LabelRecord[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500)
    const rows = options.normalizedSearch
      ? await this.db.getAll<LabelRow>(
          `SELECT * FROM labels WHERE identity_id = ? AND normalized_name LIKE ?
           ORDER BY name ASC, id ASC LIMIT ?`,
          [options.identityId, `%${options.normalizedSearch}%`, limit],
        )
      : await this.db.getAll<LabelRow>(
          'SELECT * FROM labels WHERE identity_id = ? ORDER BY name ASC, id ASC LIMIT ?',
          [options.identityId, limit],
        )
    return rows.map(fromRow)
  }

  replaceGoalLabels(identityId: string, goalId: string, labelIds: readonly string[]): Promise<void> {
    return this.replaceLabels('goal', identityId, goalId, labelIds)
  }

  replaceTaskLabels(identityId: string, taskPlanId: string, labelIds: readonly string[]): Promise<void> {
    return this.replaceLabels('task', identityId, taskPlanId, labelIds)
  }

  async listGoalLabels(identityId: string, goalId: string): Promise<LabelRecord[]> {
    return this.listAssigned('goal_labels', 'goal_id', identityId, goalId)
  }

  async listTaskLabels(identityId: string, taskPlanId: string): Promise<LabelRecord[]> {
    return this.listAssigned('task_labels', 'task_template_id', identityId, taskPlanId)
  }

  async listGoalLabelsByGoalIds(
    identityId: string,
    goalIds: readonly string[],
  ): Promise<Map<string, LabelRecord[]>> {
    return this.listAssignedBatch('goal_labels', 'goal_id', identityId, goalIds)
  }

  async listTaskLabelsByTaskPlanIds(
    identityId: string,
    taskPlanIds: readonly string[],
  ): Promise<Map<string, LabelRecord[]>> {
    return this.listAssignedBatch('task_labels', 'task_template_id', identityId, taskPlanIds)
  }

  async findGoalIdsMatchingAllLabels(identityId: string, labelIds: readonly string[]): Promise<string[]> {
    return this.findAllMatches('goal_labels', 'goal_id', identityId, labelIds)
  }

  async findTaskPlanIdsMatchingAllLabels(identityId: string, labelIds: readonly string[]): Promise<string[]> {
    return this.findAllMatches('task_labels', 'task_template_id', identityId, labelIds)
  }

  private async replaceLabels(
    kind: 'goal' | 'task',
    identityId: string,
    ownerId: string,
    labelIds: readonly string[],
  ): Promise<void> {
    await this.db.writeTransaction(async (tx) => {
      const ownerTable = kind === 'goal' ? 'goals' : 'task_templates'
      const owner = await tx.getOptional<{ id: string }>(
        `SELECT id FROM ${ownerTable} WHERE id = ? AND identity_id = ? LIMIT 1`,
        [ownerId, identityId],
      )
      if (!owner) throw new Error(`${kind === 'goal' ? 'Goal' : 'Task template'} not found.`)

      const uniqueIds = [...new Set(labelIds)]
      for (const labelId of uniqueIds) {
        const label = await tx.getOptional<{ id: string }>(
          'SELECT id FROM labels WHERE id = ? AND identity_id = ? LIMIT 1',
          [labelId, identityId],
        )
        if (!label) throw new Error('One or more labels do not belong to the identity.')
      }

      const linkTable = kind === 'goal' ? 'goal_labels' : 'task_labels'
      const ownerColumn = kind === 'goal' ? 'goal_id' : 'task_template_id'
      await tx.execute(`DELETE FROM ${linkTable} WHERE identity_id = ? AND ${ownerColumn} = ?`, [identityId, ownerId])
      for (const labelId of uniqueIds) {
        await tx.execute(
          `INSERT INTO ${linkTable} (id, identity_id, ${ownerColumn}, label_id) VALUES (?, ?, ?, ?)`,
          [`${identityId}:${ownerId}:${labelId}`, identityId, ownerId, labelId],
        )
      }
    })
  }

  private async listAssigned(
    linkTable: 'goal_labels' | 'task_labels',
    ownerColumn: 'goal_id' | 'task_template_id',
    identityId: string,
    ownerId: string,
  ): Promise<LabelRecord[]> {
    const rows = await this.db.getAll<LabelRow>(
      `SELECT l.* FROM labels l
       INNER JOIN ${linkTable} x ON x.label_id = l.id AND x.identity_id = l.identity_id
       WHERE x.identity_id = ? AND x.${ownerColumn} = ? ORDER BY l.name ASC, l.id ASC`,
      [identityId, ownerId],
    )
    return rows.map(fromRow)
  }

  private async listAssignedBatch(
    linkTable: 'goal_labels' | 'task_labels',
    ownerColumn: 'goal_id' | 'task_template_id',
    identityId: string,
    ownerIds: readonly string[],
  ): Promise<Map<string, LabelRecord[]>> {
    const ids = [...new Set(ownerIds)]
    const result = new Map(ids.map((id) => [id, [] as LabelRecord[]]))
    if (!ids.length) return result
    const placeholders = ids.map(() => '?').join(', ')
    const rows = await this.db.getAll<LabelRow & { owner_id: string }>(
      `SELECT l.*, x.${ownerColumn} AS owner_id FROM labels l
       INNER JOIN ${linkTable} x ON x.label_id = l.id AND x.identity_id = l.identity_id
       WHERE x.identity_id = ? AND x.${ownerColumn} IN (${placeholders})
       ORDER BY x.${ownerColumn} ASC, l.name ASC, l.id ASC`,
      [identityId, ...ids],
    )
    for (const row of rows) result.get(row.owner_id)?.push(fromRow(row))
    return result
  }

  private async findAllMatches(
    linkTable: 'goal_labels' | 'task_labels',
    ownerColumn: 'goal_id' | 'task_template_id',
    identityId: string,
    labelIds: readonly string[],
  ): Promise<string[]> {
    const uniqueIds = [...new Set(labelIds)]
    if (!uniqueIds.length) return []
    const placeholders = uniqueIds.map(() => '?').join(', ')
    const rows = await this.db.getAll<{ owner_id: string; label_id: string }>(
      `SELECT ${ownerColumn} AS owner_id, label_id FROM ${linkTable}
       WHERE identity_id = ? AND label_id IN (${placeholders})`,
      [identityId, ...uniqueIds],
    )
    const found = new Map<string, Set<string>>()
    for (const row of rows) {
      const labels = found.get(row.owner_id) ?? new Set<string>()
      labels.add(row.label_id)
      found.set(row.owner_id, labels)
    }
    return [...found.entries()]
      .filter(([, labels]) => uniqueIds.every((id) => labels.has(id)))
      .map(([id]) => id)
      .sort()
  }
}

function fromRow(row: LabelRow): LabelRecord {
  return {
    id: row.id,
    identityId: row.identity_id,
    name: row.name,
    normalizedName: row.normalized_name,
    color: row.color,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  }
}
