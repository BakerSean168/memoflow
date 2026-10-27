/**
 * Goal - cross-domain reference contracts (Issue #635).
 *
 * Goal is the authority for Goal/KeyResult identity and title. Consumers that
 * only need to display a linked Goal compose these two narrow references
 * instead of hydrating the full `GoalClientDTO` aggregate, which carries
 * description, reminders, labels, every KeyResult and every Review.
 *
 * Composition owners (workspace-contracts) depend on this file, never on the
 * aggregate, so a Task detail surface cannot drag the whole Goal tree over the
 * wire (ADR-069 / ADR-075 read-side composition).
 */
import { z } from 'zod';
import { brandedId } from '@memoflow/shared-primitives';
import type { GoalId } from '../value-objects/goal-id';
import type { KeyResultId } from '../value-objects/key-result-id';
import type { GoalClientDTO } from '../aggregates/goal-client';
import type { KeyResultClientDTO } from '../entities/key-result-client';

/** Goal identity plus the single title a consumer renders. */
export const GoalReferenceSchema = z
  .object({
    goalId: brandedId<GoalId>(),
    goalTitle: z.string(),
  })
  .strict();
export type GoalReference = z.infer<typeof GoalReferenceSchema>;

/** KeyResult identity plus the single title a consumer renders. */
export const KeyResultReferenceSchema = z
  .object({
    keyResultId: brandedId<KeyResultId>(),
    keyResultTitle: z.string(),
  })
  .strict();
export type KeyResultReference = z.infer<typeof KeyResultReferenceSchema>;

/** Project the Goal-owned display pair out of the authoritative Goal DTO. */
export function toGoalReference(goal: Pick<GoalClientDTO, 'id' | 'name'>): GoalReference {
  return { goalId: goal.id, goalTitle: goal.name };
}

/** Project the KeyResult-owned display pair out of the authoritative KR DTO. */
export function toKeyResultReference(
  keyResult: Pick<KeyResultClientDTO, 'id' | 'title'>,
): KeyResultReference {
  return { keyResultId: keyResult.id, keyResultTitle: keyResult.title };
}
