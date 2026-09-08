/**
 * Task Goal Link value object.
 * ADR-056/ADR-075: a Task may serve a whole Goal, a specific KR, or a KR with
 * automatic contribution. Contribution without a KR is invalid.
 */
import { ValueObject } from '@memoflow/utils/domain';
import type {
  GoalContributionRule,
  TaskGoalLink as ITaskGoalLink,
  TaskGoalLinkDTO,
} from '@memoflow/contracts/task';
import { TaskGoalBindingTrigger } from '@memoflow/contracts/task';
import type { GoalId, KeyResultId } from '@memoflow/contracts/primitives';

export class TaskGoalBinding extends ValueObject<TaskGoalLinkDTO> implements ITaskGoalLink {
  private constructor(props: TaskGoalLinkDTO) {
    super(props);
  }

  public static create(props: TaskGoalLinkDTO): TaskGoalBinding {
    const normalized = this.normalize(props);
    this.validate(normalized);
    return new TaskGoalBinding(normalized);
  }

  public static bindToGoal(
    goalId: GoalId,
    keyResultId: KeyResultId | null = null,
    contribution: GoalContributionRule | null = null,
  ): TaskGoalBinding {
    return TaskGoalBinding.create({ goalId, keyResultId, contribution });
  }

  public static fromDTO(dto: TaskGoalLinkDTO): TaskGoalBinding {
    return TaskGoalBinding.create(dto);
  }

  private static validate(props: TaskGoalLinkDTO): void {
    if (!props.goalId || props.goalId.trim().length === 0) throw new Error('Goal ID is required');
    if (props.keyResultId !== null && props.keyResultId.trim().length === 0) {
      throw new Error('Key Result ID cannot be empty');
    }
    if (props.contribution && !props.keyResultId) {
      throw new Error('Goal contribution requires a Key Result');
    }
    if (!props.contribution) return;
    if (!Number.isFinite(props.contribution.value) || props.contribution.value <= 0) {
      throw new Error('Goal contribution value must be positive');
    }
    if (!Object.values(TaskGoalBindingTrigger).includes(props.contribution.trigger)) {
      throw new Error('Task goal contribution trigger is invalid');
    }
  }

  private static normalize(props: TaskGoalLinkDTO): TaskGoalLinkDTO {
    return {
      goalId: props.goalId,
      keyResultId: props.keyResultId ?? null,
      contribution: props.contribution ?? null,
    };
  }

  public get goalId(): GoalId {
    return this.props.goalId as GoalId;
  }

  public get keyResultId(): KeyResultId | null {
    return (this.props.keyResultId as KeyResultId | null) ?? null;
  }

  public get contribution(): GoalContributionRule | null {
    return this.props.contribution ? { ...this.props.contribution } : null;
  }

  public get hasContribution(): boolean {
    return this.props.contribution !== null;
  }

  public withContribution(contribution: GoalContributionRule | null): TaskGoalBinding {
    return TaskGoalBinding.create({ ...this.props, contribution });
  }

  public getDisplayText(): string {
    const kr = this.props.keyResultId ? `, KR: ${this.props.keyResultId}` : '';
    const contribution = this.props.contribution
      ? `, Contribution: ${this.props.contribution.value} (${this.props.contribution.trigger})`
      : ', Contribution: off';
    return `Goal: ${this.props.goalId}${kr}${contribution}`;
  }

  public toDTO(): TaskGoalLinkDTO {
    return {
      goalId: this.props.goalId,
      keyResultId: this.props.keyResultId ?? null,
      contribution: this.props.contribution ? { ...this.props.contribution } : null,
    };
  }
}
