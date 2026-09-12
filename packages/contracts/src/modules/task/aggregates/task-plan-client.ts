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
import type { TaskPlanSchedule, TaskReminderConfigDTO, TaskGoalBindingDTO } from '../value-objects';

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
  labels: LabelClientDTO[];
  status: TaskPlanStatus;
  outcome: TaskPlanOutcome;
  completionPolicy: TaskPlanCompletionPolicy;
  closedAt: TransferDate | null;
  archivedAt: TransferDate | null;
  abandonedReason: string | null;
  lastGeneratedDate: TransferDate | null;
  generateAheadDays: number | null; // null for ONE_TIME tasks
  version: number;
  createdAt: TransferDate;
  updatedAt: TransferDate;
  deletedAt: TransferDate | null;
  history?: unknown[];
  instances?: unknown[];

  instanceCount: number;
  completedInstanceCount: number;
  pendingInstanceCount: number;
  dueInstanceCount: number;
  completedDueInstanceCount: number;
  completionWindowDays: 30;
  futurePendingInstanceCount: number;
  singleInstanceStatus: TaskOccurrenceStatus | null;
  completionRate: number;
}
