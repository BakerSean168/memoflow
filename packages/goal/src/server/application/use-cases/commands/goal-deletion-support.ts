import type { IGoalRepository } from '../../../domain';
import type { GoalRelationCleanupPort } from '../../ports/goal-relation-cleanup.port';

export interface GoalDeletionTransactionContext {
  readonly goalRepository: IGoalRepository;
  readonly relationCleanup: GoalRelationCleanupPort;
}

/** Same-database transaction seam for Goal deletion + Shared Relation cleanup. */
export interface GoalDeletionTransactionRunner {
  run<T>(work: (context: GoalDeletionTransactionContext) => Promise<T>): Promise<T>;
}
