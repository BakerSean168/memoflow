/**
 * TaskPlan Aggregate Root - Server Interface
 */

import type {
  TaskPlanId,
  IdentityId,
  TransferDate,
} from '../../../primitives';
import type { TaskPlanStatus } from '../value-objects/task-plan-status';
import type { TaskPlanOutcome } from '../value-objects/task-plan-outcome';
import type { TaskPlanCompletionPolicy } from '../value-objects/task-plan-completion-policy';
import type { TaskOccurrenceServerDTO } from './task-occurrence-server';
import type {
  TaskTimeConfigDTO,
  RecurrenceRuleDTO,
  TaskReminderConfigDTO,
  TaskGoalBindingDTO,
  ChecklistItemDefinitionDTO,
} from '../value-objects';

// Import shared types
import { ImportanceLevel } from '../../../shared/value-objects/importance';

// ============ DTO Definitions ============

/**
 * TaskPlan Server DTO
 */
// Residual 879: intentional Client≠Server dual (client extra projection fields vs server checklist).
export interface TaskPlanServerDTO {
  id: TaskPlanId;
  identityId: IdentityId;
  name: string;
  description: string | null;

  timeConfig: TaskTimeConfigDTO | null;
  recurrenceRule: RecurrenceRuleDTO | null;
  reminderConfig: TaskReminderConfigDTO | null;
  lastGeneratedDate: TransferDate | null;
  generateAheadDays: number | null;

  importance: ImportanceLevel;
  status: TaskPlanStatus;
  outcome: TaskPlanOutcome;
  completionPolicy: TaskPlanCompletionPolicy;
  closedAt: TransferDate | null;
  archivedAt: TransferDate | null;
  abandonedReason: string | null;

  goalBinding: TaskGoalBindingDTO | null;

  checklist: ChecklistItemDefinitionDTO[]; // To be defined later


  // === Other ===
  version: number;
  createdAt: TransferDate;
  updatedAt: TransferDate;
  deletedAt: TransferDate | null;
  instances?: TaskOccurrenceServerDTO[];
}
