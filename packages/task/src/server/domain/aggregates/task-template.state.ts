import type { ImportanceLevel } from '@memoflow/contracts/shared';
import type { Instant } from '@memoflow/contracts/primitives';
import type { IdentityId } from '@memoflow/domain-shared';
import type { TaskType } from '../value-objects';
import type {
  TaskPlanCompletionPolicyValue,
  TaskPlanOutcomeValue,
} from '@memoflow/contracts/task';
import type { TaskTemplateStatus } from '../../domain/value-objects/task-template-status';
import type { TaskTemplateId } from '../../domain/value-objects/task-template-id';
import type {
  ChecklistItemDefinition,
  RecurrenceRule,
  TaskGoalBinding,
  TaskReminderConfig,
  TaskTimeConfig,
} from '../value-objects';

export interface TaskTemplateState {
  id: TaskTemplateId;
  identityId: IdentityId;
  title: string;
  description: string | null;
  taskType: TaskType;
  importance: ImportanceLevel;
  status: TaskTemplateStatus;
  outcome: TaskPlanOutcomeValue;
  completionPolicy: TaskPlanCompletionPolicyValue;
  closedAt: Instant | null;
  archivedAt: Instant | null;
  abandonedReason: string | null;
  goalBinding: TaskGoalBinding | null;
  checklist: ChecklistItemDefinition[];
  timeConfig: TaskTimeConfig | null;
  recurrenceRule: RecurrenceRule | null;
  reminderConfig: TaskReminderConfig | null;
  lastGeneratedDate: Instant | null;
  generateAheadDays: number | null;
  startDate: Instant | null;
  dueDate: Instant | null;
  completedAt: Instant | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  note: string | null;
  createdAt: Instant;
  updatedAt: Instant;
  deletedAt: Instant | null;
  version: number;
}

export type TaskTemplateProps = Omit<TaskTemplateState, 'id'>;
