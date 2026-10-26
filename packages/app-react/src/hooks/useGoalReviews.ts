import { useEffect, useState } from 'react';

import type { GoalReviewClientDTO } from '@memoflow/goal-contracts';
import { presentErrorMessage } from '@memoflow/http-client';
import { useAppSession } from './useAppSession';
import { useGoalService } from './useGoalService';

export type GoalReviewSummary = {
  id: string;
  goalId: string;
  reflection: string;
  challenges: string | null;
  adjustments: string | null;
  systemContext: GoalReviewClientDTO['systemContext'];
  reviewedAt: number;
  createdAt: number;
};

export function mapGoalReview(review: GoalReviewClientDTO): GoalReviewSummary {
  return {
    id: String(review.id),
    goalId: String(review.goalId),
    reflection: review.reflection,
    challenges: review.challenges,
    adjustments: review.adjustments,
    systemContext: review.systemContext,
    reviewedAt: review.reviewedAt,
    createdAt: review.createdAt,
  };
}

export function useGoalReviews(goalId: string | null) {
  const service = useGoalService();
  const { isRemoteAuthenticated } = useAppSession();
  const [reviews, setReviews] = useState<GoalReviewSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!isRemoteAuthenticated || !goalId) {
      setReviews([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const result = await service.getGoalAggregateView(goalId);
    if (!result.ok) {
      setReviews([]);
      setError(presentErrorMessage(result.error));
      setIsLoading(false);
      return;
    }

    setReviews(result.data.reviews.map(mapGoalReview).sort((a, b) => b.reviewedAt - a.reviewedAt));
    setIsLoading(false);
  }

  useEffect(() => {
    void load();
  }, [goalId, isRemoteAuthenticated]);

  return { error, isLoading, refresh: load, reviews };
}
