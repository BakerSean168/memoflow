/**
 * TaskPlan Aggregate Root - Client Interface
 */

import type { LabelClientDTO } from '../../label';
import type { TaskPlanId, IdentityId, TransferDate } from '../../../primitives';

import type { TaskPlanStatus } from '../value-objects/task-plan-status';
import type { TaskPlanOutcome } from '../value-objects/task-plan-outcome';
import type { TaskPlanCompletionPolicy } from '../value-objects/task-plan-completion-policy';
import type { TaskOccurrenceStatus } from '../value-objects/task-occurrence-status';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import type {
  TaskPlanSchedule,
  TaskReminderConfigDTO,
  TaskGoalBindingDTO,
  ChecklistItemDefinitionDTO,
} from '../value-objects';

// Residual 879: intentional Client≠Server dual (client extra projection fields vs server checklist).
export interface TaskPlanClientDTO {
  id: TaskPlanId;
  identityId: IdentityId;
  name: string;
  description: string | null;

  schedule: TaskPlanSchedule;
  reminderConfig: TaskReminderConfigDTO | null;
  importance: ImportanceLevel;

  goalBinding: TaskGoalBindingDTO | null;
  checklist: ChecklistItemDefinitionDTO[];
  labels: LabelClientDTO[];
  status: TaskPlanStatus;
  outcome: TaskPlanOutcome;
  completionPolicy: TaskPlanCompletionPolicy;
  closedAt: TransferDate | null;
  archivedAt: TransferDate | null;
  abandonedReason: string | null;
  version: number;
  createdAt: TransferDate;
  updatedAt: TransferDate;
  deletedAt: TransferDate | null;
  history?: unknown[];

  occurrenceCount: number;
  completedOccurrenceCount: number;
  pendingOccurrenceCount: number;
  dueOccurrenceCount: number;
  completedDueOccurrenceCount: number;
  completionWindowDays: 30;
  futurePendingOccurrenceCount: number;
  singleOccurrenceStatus: TaskOccurrenceStatus | null;
  completionRate: number;
}
