/**
 * TaskPlan Aggregate Root - Domain Client
 * 任务模板聚合根 - 领域客户端
 *
 * 【规范说明】
 * - Private constructor with params object
 * - Public getters via this._props.xxx
 * - Static load(state: TaskPlanState): TaskPlan
 * - Instance toDTO(): TaskPlanClientDTO
 */

import type {
  TaskPlanClientDTO,
  TaskTimeConfig,
  TaskTimeConfigDTO,
  RecurrenceRule,
  RecurrenceRuleDTO,
  TaskReminderConfig,
  TaskReminderConfigDTO,
  TaskGoalBinding,
  TaskGoalBindingDTO,
  TaskPlanStatus,
  TaskPlanOutcomeValue,
  TaskPlanCompletionPolicyValue,
} from '@memoflow/contracts/task';
import type { ImportanceLevel } from '@memoflow/contracts/shared';
import type { LabelClientDTO } from '@memoflow/contracts/label';
import type { GoalId, KeyResultId, Instant } from '@memoflow/contracts/primitives';
import { AggregateRoot } from '@memoflow/utils/domain';
import { TaskPlanId } from '../../server/domain/value-objects/task-plan-id';
import { IdentityId } from '@memoflow/domain-shared';

export interface TaskPlanState {
  id: TaskPlanId;
  identityId: IdentityId;
  name: string;
  description: string | null;
  timeConfig: TaskTimeConfig;
  recurrenceRule: RecurrenceRule | null;
  reminderConfig: TaskReminderConfig | null;
  importance: ImportanceLevel;
  goalBinding: TaskGoalBinding | null;
  labels: LabelClientDTO[];
  status: TaskPlanStatus;
  outcome: TaskPlanOutcomeValue;
  completionPolicy: TaskPlanCompletionPolicyValue;
  closedAt: Instant | null;
  archivedAt: Instant | null;
  abandonedReason: string | null;
  lastGeneratedDate: Instant | null;
  generateAheadDays: number | null;
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
  deletedAt: Instant | null;
  instanceCount: number;
  completedInstanceCount: number;
  pendingInstanceCount: number;
  dueInstanceCount: number;
  completedDueInstanceCount: number;
  completionWindowDays: 30;
  futurePendingInstanceCount: number;
  singleInstanceStatus: TaskPlanClientDTO['singleInstanceStatus'];
  completionRate: number;
  history?: unknown[];
  instances?: unknown[];
}

export class TaskPlan extends AggregateRoot<TaskPlanId> {
  // ================= 1. Props =================
  private readonly _props: TaskPlanState;

  // ================= 2. Constructor (Private) =================
  private constructor(props: TaskPlanState) {
    super(props.id);
    this._props = props;
  }

  // ================= 3. Getters =================
  get identityId(): IdentityId {
    return this._props.identityId;
  }

  get name(): string {
    return this._props.name;
  }

  get description(): string | null {
    return this._props.description;
  }

  get timeConfig(): TaskTimeConfig {
    return this._props.timeConfig;
  }

  get recurrenceRule(): RecurrenceRule | null {
    return this._props.recurrenceRule;
  }

  get reminderConfig(): TaskReminderConfig | null {
    return this._props.reminderConfig;
  }

  get importance(): ImportanceLevel {
    return this._props.importance;
  }

  get goalBinding(): TaskGoalBinding | null {
    return this._props.goalBinding;
  }

  get labels(): LabelClientDTO[] {
    return this._props.labels.map((label) => ({ ...label }));
  }

  get status(): TaskPlanStatus {
    return this._props.status;
  }
  get outcome(): TaskPlanOutcomeValue {
    return this._props.outcome;
  }
  get completionPolicy(): TaskPlanCompletionPolicyValue {
    return this._props.completionPolicy;
  }
  get closedAt(): Instant | null {
    return this._props.closedAt;
  }
  get archivedAt(): Instant | null {
    return this._props.archivedAt;
  }
  get abandonedReason(): string | null {
    return this._props.abandonedReason;
  }

  get lastGeneratedDate(): Instant | null {
    const v = this._props.lastGeneratedDate;
    if (v == null) return null;
    return v as Instant;
  }

  get generateAheadDays(): number | null {
    return this._props.generateAheadDays;
  }

  get version(): number {
    return this._props.version;
  }

  get createdAt(): Instant {
    const v = this._props.createdAt;
    return v as Instant;
  }

  get updatedAt(): Instant {
    const v = this._props.updatedAt;
    return v as Instant;
  }

  get deletedAt(): Instant | null {
    const v = this._props.deletedAt;
    if (v == null) return null;
    return v as Instant;
  }

  get instanceCount(): number {
    return this._props.instanceCount;
  }

  get completedInstanceCount(): number {
    return this._props.completedInstanceCount;
  }

  get pendingInstanceCount(): number {
    return this._props.pendingInstanceCount;
  }

  get dueInstanceCount(): number {
    return this._props.dueInstanceCount;
  }

  get completedDueInstanceCount(): number {
    return this._props.completedDueInstanceCount;
  }

  get completionWindowDays(): 30 {
    return this._props.completionWindowDays;
  }

  get futurePendingInstanceCount(): number {
    return this._props.futurePendingInstanceCount;
  }

  get singleInstanceStatus(): TaskPlanClientDTO['singleInstanceStatus'] {
    return this._props.singleInstanceStatus;
  }

  get completionRate(): number {
    return this._props.completionRate;
  }

  get history(): unknown[] | undefined {
    return this._props.history ? [...this._props.history] : undefined;
  }

  get instances(): unknown[] | undefined {
    return this._props.instances ? [...this._props.instances] : undefined;
  }

  // UI 计算属性
  get isDeleted(): boolean {
    return this._props.deletedAt !== null;
  }

  // ================= 4. Factory Methods =================
  public static load(state: TaskPlanState): TaskPlan {
    return new TaskPlan(state);
  }

  // ================= 5. DTO Conversion =================
  public toDTO(): TaskPlanClientDTO {
    return {
      id: String(this.id) as TaskPlanClientDTO['id'],
      identityId: String(this._props.identityId) as TaskPlanClientDTO['identityId'],
      name: this._props.name,
      description: this._props.description,
      timeConfig: this.serializeTimeConfig(this._props.timeConfig),
      recurrenceRule: this._props.recurrenceRule
        ? this.serializeRecurrenceRule(this._props.recurrenceRule)
        : null,
      reminderConfig: this._props.reminderConfig as TaskReminderConfigDTO | null,
      importance: this._props.importance,
      goalBinding: this._props.goalBinding
        ? this.serializeGoalBinding(this._props.goalBinding)
        : null,
      labels: this._props.labels.map((label) => ({ ...label })),
      status: this._props.status,
      outcome: this._props.outcome,
      completionPolicy: this._props.completionPolicy,
      closedAt: this._props.closedAt,
      archivedAt: this._props.archivedAt,
      abandonedReason: this._props.abandonedReason,
      lastGeneratedDate: this._props.lastGeneratedDate ?? null,
      generateAheadDays: this._props.generateAheadDays,
      version: this._props.version,
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
      deletedAt: this._props.deletedAt ?? null,
      instanceCount: this._props.instanceCount,
      completedInstanceCount: this._props.completedInstanceCount,
      pendingInstanceCount: this._props.pendingInstanceCount,
      dueInstanceCount: this._props.dueInstanceCount,
      completedDueInstanceCount: this._props.completedDueInstanceCount,
      completionWindowDays: this._props.completionWindowDays,
      futurePendingInstanceCount: this._props.futurePendingInstanceCount,
      singleInstanceStatus: this._props.singleInstanceStatus,
      completionRate: this._props.completionRate,
      history: this._props.history ? [...this._props.history] : undefined,
      instances: this._props.instances ? [...this._props.instances] : undefined,
    };
  }

  private serializeTimeConfig(config: TaskTimeConfig): TaskTimeConfigDTO {
    return {
      timeType: config.timeType,
      startDate: config.startDate ? Number(config.startDate) : null,
      timePoint: config.timePoint,
      timeRange: config.timeRange,
    };
  }

  private serializeRecurrenceRule(rule: RecurrenceRule): RecurrenceRuleDTO {
    return {
      frequency: rule.frequency,
      interval: rule.interval,
      daysOfWeek: rule.daysOfWeek,
      endDate: rule.endDate ?? null,
      occurrences: rule.occurrences,
    };
  }

  private serializeGoalBinding(binding: TaskGoalBinding): TaskGoalBindingDTO {
    return {
      goalId: String(binding.goalId) as GoalId,
      keyResultId: String(binding.keyResultId) as KeyResultId,
      contribution: binding.contribution ? { ...binding.contribution } : null,
    };
  }
}
