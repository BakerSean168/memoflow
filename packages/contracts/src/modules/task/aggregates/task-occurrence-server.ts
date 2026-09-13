/**
 * TaskOccurrence canonical server DTO (ADR-071 / ADR-073).
 *
 * This shape represents durable occurrence truth. Legacy Template/Instance
 * presentation fields remain client-projection concerns until TASK-7306.
 */

import type { IdentityId, TaskOccurrenceId, TaskPlanId, TransferDate } from '../../../primitives';
import type { ImportanceLevel } from '../../../shared/value-objects/importance';
import type {
  TaskOccurrenceChecklistItem,
  TaskOccurrenceResult,
  TaskOccurrenceScheduleSnapshot,
  TaskOccurrenceStatus,
} from '../value-objects';

export interface TaskOccurrenceServerDTO {
  id: TaskOccurrenceId;
  planId: TaskPlanId;
  identityId: IdentityId;
  occurrenceKey: string;
  scheduleSnapshot: TaskOccurrenceScheduleSnapshot;
  importanceSnapshot: ImportanceLevel;
  status: TaskOccurrenceStatus;
  actualStartAt: TransferDate | null;
  result: TaskOccurrenceResult | null;
  checklistState: TaskOccurrenceChecklistItem[];
  version: number;
  createdAt: TransferDate;
  updatedAt: TransferDate;
  deletedAt: TransferDate | null;
}
