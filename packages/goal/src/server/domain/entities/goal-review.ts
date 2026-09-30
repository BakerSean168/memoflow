/** Goal Review V2: an immutable system snapshot plus editable reflection. */
import { Entity } from '@memoflow/utils/domain';
import type {
  GoalReviewId as IGoalReviewId,
  GoalId as IGoalId,
  Instant,
  TransferDate,
} from '@memoflow/contracts/primitives';
import type { GoalReviewServerDTO, GoalReviewSystemContext } from '@memoflow/contracts/goal';
import { GoalReviewSystemContextSchema } from '@memoflow/contracts/goal';
import { GoalReviewId } from '../../domain';

export interface GoalReviewState {
  id: IGoalReviewId;
  goalId: IGoalId;
  reflection: string;
  challenges: string | null;
  adjustments: string | null;
  systemContext: GoalReviewSystemContext;
  reviewedAt: Instant;
  createdAt: Instant;
  updatedAt: Instant;
}

function cloneContext(context: GoalReviewSystemContext): GoalReviewSystemContext {
  return GoalReviewSystemContextSchema.parse(context);
}

function optionalText(value?: string | null): string | null {
  return value?.trim() || null;
}

export class GoalReview extends Entity<IGoalReviewId> {
  private _props: GoalReviewState;

  private constructor(state: GoalReviewState) {
    super(state.id);
    this._props = { ...state, systemContext: cloneContext(state.systemContext) };
  }

  get goalId(): IGoalId {
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
    return cloneContext(this._props.systemContext);
  }
  get reviewedAt(): Instant {
    return this._props.reviewedAt;
  }
  get createdAt(): Instant {
    return this._props.createdAt;
  }
  get updatedAt(): Instant {
    return this._props.updatedAt;
  }

  public static create(params: {
    id?: IGoalReviewId;
    goalId: IGoalId;
    reflection: string;
    challenges?: string | null;
    adjustments?: string | null;
    systemContext: GoalReviewSystemContext;
    reviewedAt?: Instant;
  }): GoalReview {
    const reflection = params.reflection.trim();
    if (!reflection) throw new Error('Reflection is required');
    const now = Date.now();
    return new GoalReview({
      id: params.id ?? GoalReviewId.of(GoalReviewId.generate()),
      goalId: params.goalId,
      reflection,
      challenges: optionalText(params.challenges),
      adjustments: optionalText(params.adjustments),
      systemContext: params.systemContext,
      reviewedAt: params.reviewedAt ?? now,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static load(state: GoalReviewState): GoalReview {
    return new GoalReview(state);
  }

  public updateReflection(reflection: string): void {
    const trimmed = reflection.trim();
    if (!trimmed) throw new Error('Reflection cannot be empty');
    this._props.reflection = trimmed;
    this.touch();
  }

  public updateChallenges(challenges: string | null): void {
    this._props.challenges = optionalText(challenges);
    this.touch();
  }

  public updateAdjustments(adjustments: string | null): void {
    this._props.adjustments = optionalText(adjustments);
    this.touch();
  }

  public toServerDTO(): GoalReviewServerDTO {
    return {
      id: this.id,
      goalId: this._props.goalId,
      reflection: this._props.reflection,
      challenges: this._props.challenges,
      adjustments: this._props.adjustments,
      systemContext: cloneContext(this._props.systemContext),
      reviewedAt: this._props.reviewedAt as TransferDate,
      createdAt: this._props.createdAt as TransferDate,
      updatedAt: this._props.updatedAt as TransferDate,
    };
  }

  public toClientDTO(): import('@memoflow/contracts/goal').GoalReviewClientDTO {
    return {
      id: String(this.id) as import('@memoflow/contracts/goal').GoalReviewClientDTO['id'],
      goalId: String(
        this._props.goalId,
      ) as import('@memoflow/contracts/goal').GoalReviewClientDTO['goalId'],
      reflection: this._props.reflection,
      challenges: this._props.challenges,
      adjustments: this._props.adjustments,
      systemContext: cloneContext(this._props.systemContext),
      reviewedAt: this._props.reviewedAt,
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
    };
  }

  private touch(): void {
    this._props.updatedAt = Date.now();
  }
}
