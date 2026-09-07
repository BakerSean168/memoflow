import type { ScheduleExecution } from '../entities/schedule-execution';

/**
 * IScheduleExecutionRepository - Repository Interface
 */
export interface IScheduleExecutionRepository {
  /**
   * Save ScheduleExecution entity
   */
  save(execution: ScheduleExecution): Promise<void>;

  /**
   * Find by id scoped to identity (only authorized load path)
   */
  findByIdForIdentity(identityId: string, id: string): Promise<ScheduleExecution | null>;

  /**
   * Find all executions for a task scoped to identity
   */
  findByTaskId(identityId: string, taskId: string): Promise<ScheduleExecution[]>;
}
