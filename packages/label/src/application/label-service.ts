import type {
  CreateLabelCommand,
  DeleteLabelCommand,
  GoalLabelAssignmentCommand,
  LabelDto,
  ListLabelsQuery,
  TaskLabelAssignmentCommand,
  UpdateLabelCommand,
} from '@memoflow/contracts/label'
import { normalizeLabelName, validateLabelName } from '../domain/label'
import type { LabelRepository } from '../domain/label-repository'

export interface LabelServiceOptions {
  readonly now?: () => number
  readonly idFactory?: () => string
}

export class LabelService {
  private readonly now: () => number
  private readonly idFactory: () => string

  constructor(private readonly repository: LabelRepository, options: LabelServiceOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.idFactory = options.idFactory ?? (() => globalThis.crypto.randomUUID())
  }

  async create(command: CreateLabelCommand): Promise<LabelDto> {
    const name = validateLabelName(command.name)
    const now = this.now()
    return this.repository.create({
      id: this.idFactory(),
      identityId: command.identityId,
      name: name.name,
      normalizedName: name.normalizedName,
      color: command.color ?? null,
      createdAt: now,
      updatedAt: now,
    })
  }

  async update(command: UpdateLabelCommand): Promise<LabelDto> {
    const labelName = command.name === undefined ? undefined : validateLabelName(command.name)
    const updated = await this.repository.update({
      identityId: command.identityId,
      labelId: command.labelId,
      ...(labelName ? { name: labelName.name, normalizedName: labelName.normalizedName } : {}),
      ...(command.color !== undefined ? { color: command.color } : {}),
    })
    if (!updated) throw new Error('Label not found.')
    return updated
  }

  delete(command: DeleteLabelCommand): Promise<boolean> {
    return this.repository.delete(command.identityId, command.labelId)
  }

  list(query: ListLabelsQuery): Promise<LabelDto[]> {
    return this.repository.list({
      identityId: query.identityId,
      normalizedSearch: query.search ? normalizeLabelName(query.search) : null,
      limit: query.limit,
    })
  }

  /**
   * Resolve human-readable label names into identity-owned canonical Label rows.
   *
   * AI/workflow callers deliberately propose names rather than IDs. This method
   * reuses existing normalized names, creates only missing labels, preserves the
   * caller's first-seen order, and remains replay-safe because a retry sees the
   * previously created identity-scoped label.
   */
  async resolveNames(identityId: string, names: readonly string[]): Promise<LabelDto[]> {
    const validated = names.map((name) => validateLabelName(name))
    const unique = new Map<string, { name: string; normalizedName: string }>()
    for (const item of validated) {
      if (!unique.has(item.normalizedName)) unique.set(item.normalizedName, item)
    }
    if (unique.size === 0) return []

    const existing = await this.repository.list({ identityId, limit: 500 })
    const byNormalized = new Map(existing.map((label) => [label.normalizedName, label]))
    const resolved: LabelDto[] = []

    for (const item of unique.values()) {
      let label = byNormalized.get(item.normalizedName)
      if (!label) {
        try {
          label = await this.create({ identityId, name: item.name })
        } catch (cause) {
          // A concurrent creator may win the identity/name unique race. Re-read
          // exact normalized truth before surfacing the original failure.
          const afterRace = await this.repository.list({
            identityId,
            normalizedSearch: item.normalizedName,
            limit: 50,
          })
          label = afterRace.find((candidate) => candidate.normalizedName === item.normalizedName)
          if (!label) throw cause
        }
        byNormalized.set(item.normalizedName, label)
      }
      resolved.push(label)
    }

    return resolved
  }

  setGoalLabels(command: GoalLabelAssignmentCommand): Promise<void> {
    return this.repository.replaceGoalLabels(command.identityId, command.goalId, unique(command.labelIds))
  }

  setTaskLabels(command: TaskLabelAssignmentCommand): Promise<void> {
    return this.repository.replaceTaskLabels(
      command.identityId,
      command.taskTemplateId,
      unique(command.labelIds),
    )
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}
