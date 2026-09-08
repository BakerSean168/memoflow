/**
 * Task Instance API Client Port
 *
 * Transport-agnostic interface for Task Instance API operations.
 * Implementations: HTTP adapters (web), IPC adapters (desktop)
 */

import type { Result } from '@memoflow/contracts/result';
import type {
  GetTaskOccurrencesByRangeReq,
  TaskOccurrenceClientDTO,
  CompleteTaskOccurrenceReq,
  MarkTaskOccurrenceMissedReq,
  SkipTaskOccurrenceReq,
  RescheduleTaskInput,
} from '@memoflow/contracts/task';

export interface ITaskOccurrenceApiClient {
  getTaskOccurrences(params?: {
    page?: number;
    limit?: number;
    templateId?: string;
    status?: string;
  }): Promise<Result<TaskOccurrenceClientDTO[]>>;
  getTaskOccurrencesByDateRange(
    request: GetTaskOccurrencesByRangeReq,
  ): Promise<Result<TaskOccurrenceClientDTO[]>>;
  getTaskOccurrenceById(id: string): Promise<Result<TaskOccurrenceClientDTO>>;
  deleteTaskOccurrence(id: string): Promise<Result<void>>;
  startTaskOccurrence(id: string): Promise<Result<TaskOccurrenceClientDTO>>;
  completeTaskOccurrence(
    id: string,
    request?: CompleteTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrenceClientDTO>>;
  uncompleteTaskOccurrence(id: string): Promise<Result<TaskOccurrenceClientDTO>>;
  skipTaskOccurrence(
    id: string,
    request?: SkipTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrenceClientDTO>>;
  markTaskOccurrenceMissed(
    id: string,
    request?: MarkTaskOccurrenceMissedReq,
  ): Promise<Result<TaskOccurrenceClientDTO>>;
  rescheduleTaskOccurrence(
    id: string,
    request: RescheduleTaskInput,
  ): Promise<Result<TaskOccurrenceClientDTO>>;
}
