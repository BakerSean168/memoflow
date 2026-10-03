import {
  GoalReviewWindowOptionsSchema,
  type GoalReviewWindowInput,
} from '@memoflow/contracts/goal';
import { error, ok, type Result } from '@memoflow/contracts/result';
import { createTimeFacade, type TimeContext } from '@memoflow/time';
import type { GoalReview } from '../../domain/entities/goal-review';
import type { GoalReviewWindow } from './goal-review-context-builder';

type ReviewBoundary = Pick<GoalReview, 'id' | 'systemContext'>;

/** Aggregate children are authoritative; storage/projection order is irrelevant. */
export function selectPreviousGoalReview(
  reviews: readonly ReviewBoundary[],
): ReviewBoundary | undefined {
  return reviews.reduce<ReviewBoundary | undefined>((latest, review) => {
    if (!latest) return review;
    const end = review.systemContext.windowEndAt;
    const latestEnd = latest.systemContext.windowEndAt;
    return end > latestEnd || (end === latestEnd && String(review.id) > String(latest.id))
      ? review
      : latest;
  }, undefined);
}

/** Pure Goal-owned window policy, shared by preview and creation. */
export class ReviewWindowResolver {
  resolve(
    reviews: readonly ReviewBoundary[],
    input: GoalReviewWindowInput | undefined,
    now: number,
    timeContext: TimeContext,
  ): Result<GoalReviewWindow> {
    const parsed = GoalReviewWindowOptionsSchema.safeParse(
      typeof input === 'number' ? { windowDays: input } : (input ?? {}),
    );
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message);
    const { windowDays, window } = parsed.data;
    let resolved: GoalReviewWindow;
    if (windowDays === undefined && window?.mode === 'custom') {
      resolved = { windowStartAt: window.windowStartAt, windowEndAt: window.windowEndAt };
    } else {
      if (!Number.isSafeInteger(now))
        return error('VALIDATION_ERROR', 'Review clock requires an integer instant');
      const previous =
        windowDays === undefined && (!window || window.mode === 'since-last-review')
          ? selectPreviousGoalReview(reviews)
          : undefined;
      const days = windowDays ?? (window?.mode === '30d' ? 30 : 7);
      resolved = {
        windowStartAt: previous
          ? previous.systemContext.windowEndAt
          : Number(createTimeFacade({ context: timeContext }).calendar.addDays(now, -days)),
        windowEndAt: now,
      };
    }
    if (
      !Number.isSafeInteger(resolved.windowStartAt) ||
      !Number.isSafeInteger(resolved.windowEndAt) ||
      resolved.windowStartAt >= resolved.windowEndAt
    ) {
      return error(
        'VALIDATION_ERROR',
        'Review window requires integer instants with start before end',
      );
    }
    return ok(resolved);
  }
}
