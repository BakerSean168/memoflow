import type { LabelRecord, NewLabelRecord } from './label'

export interface LabelListOptions {
  readonly identityId: string
  readonly normalizedSearch?: string | null
  readonly limit?: number
}

export interface LabelRepository {
  create(record: NewLabelRecord): Promise<LabelRecord>
  update(input: {
    identityId: string
    labelId: string
    name?: string
    normalizedName?: string
    color?: string | null
  }): Promise<LabelRecord | null>
  delete(identityId: string, labelId: string): Promise<boolean>
  findById(identityId: string, labelId: string): Promise<LabelRecord | null>
  list(options: LabelListOptions): Promise<LabelRecord[]>
  replaceGoalLabels(identityId: string, goalId: string, labelIds: readonly string[]): Promise<void>
  replaceTaskLabels(identityId: string, taskPlanId: string, labelIds: readonly string[]): Promise<void>
  listGoalLabels(identityId: string, goalId: string): Promise<LabelRecord[]>
  listTaskLabels(identityId: string, taskPlanId: string): Promise<LabelRecord[]>
  listGoalLabelsByGoalIds(identityId: string, goalIds: readonly string[]): Promise<Map<string, LabelRecord[]>>
  listTaskLabelsByTaskPlanIds(identityId: string, taskPlanIds: readonly string[]): Promise<Map<string, LabelRecord[]>>
  findGoalIdsMatchingAllLabels(identityId: string, labelIds: readonly string[]): Promise<string[]>
  findTaskPlanIdsMatchingAllLabels(identityId: string, labelIds: readonly string[]): Promise<string[]>
}
