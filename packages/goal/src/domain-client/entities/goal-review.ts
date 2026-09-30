/** Goal Review V2 read entity. */
import type { GoalReviewClientDTO, GoalReviewSystemContext } from '@memoflow/contracts/goal';
import { GoalReviewSystemContextSchema } from '@memoflow/contracts/goal';
import { Entity } from '@memoflow/utils/domain';
import { GoalReviewId, GoalId } from '../../server/domain';

export interface GoalReviewState {
  id: GoalReviewId;
  goalId: GoalId;
  reflection: string;
  challenges: string | null;
  adjustments: string | null;
  systemContext: GoalReviewSystemContext;
  reviewedAt: number;
  createdAt: number;
  updatedAt: number;
}

export class GoalReview extends Entity<GoalReviewId> {
  private readonly _props: GoalReviewState;
  private constructor(props: GoalReviewState) {
    super(props.id);
    this._props = {
      ...props,
      systemContext: GoalReviewSystemContextSchema.parse(props.systemContext),
    };
  }
  get goalId(): GoalId {
    return this._props.goalId;
  }
  get reflection(): string {
    return this._props.reflection;
  }
  get challenges(): string | null {
    return this._props.challenges;
  }
  get adjustments(): string | null {
    return this._props.adjustments;
  }
  get systemContext(): GoalReviewSystemContext {
    return this._props.systemContext;
  }
  get reviewedAt(): number {
    return this._props.reviewedAt;
  }
  get createdAt(): number {
    return this._props.createdAt;
  }
  get updatedAt(): number {
    return this._props.updatedAt;
  }
  public static load(state: GoalReviewState): GoalReview {
    return new GoalReview(state);
  }
  public toDTO(): GoalReviewClientDTO {
    return {
      id: String(this.id) as GoalReviewClientDTO['id'],
      goalId: String(this._props.goalId) as GoalReviewClientDTO['goalId'],
      reflection: this._props.reflection,
      challenges: this._props.challenges,
      adjustments: this._props.adjustments,
      systemContext: this._props.systemContext,
      reviewedAt: this._props.reviewedAt,
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
    };
  }
}
