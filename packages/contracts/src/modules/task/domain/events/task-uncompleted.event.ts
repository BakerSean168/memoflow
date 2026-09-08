/**
 * Task Uncompleted Event
 * 
 * Triggered when: Completed task is marked as incomplete again
 * Subscribers: User statistics, Goal progress recalculation
 * 
 * 【说明】
 * - aggregateId 已由 addDomainEvent 自动生成，无需重复定义
 * - occurredAt 已由 addDomainEvent 自动生成，无需重复定义
 */
import type { IdentityId, TaskOccurrenceId, TaskPlanId } from '../../../../primitives';

export interface TaskUncompletedEvent {
  identityId: IdentityId;
  taskOccurrenceId: TaskOccurrenceId;
  taskPlanId: TaskPlanId;
  uncompletedAt: number;
}
