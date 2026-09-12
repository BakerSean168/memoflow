/**
 * @memoflow/contracts - Mock Generators
 *
 * Re-exports all mock factory functions from sub-modules.
 * These are **development-only** helpers — do not import in production code.
 *
 * @example
 * ```ts
 * import {
 *   createMockGoal,
 *   createMockGoalList,
 *   createMockTaskPlan,
 *   createMockAccount,
 *   createMockScheduleTask,
 *   createMockReminderTemplate,
 *   createMockNotification,
 *   createMockRule,
 *   createMockRuleRevision,
 * } from '@memoflow/contracts/mocks';
 * ```
 */

export * from './goal.mock';
export * from './task.mock';
export * from './account.mock';
export * from './schedule.mock';
export * from './reminder.mock';
export * from './notification.mock';
export * from './governance.mock';
