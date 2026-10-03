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
  TaskGoalLinkInput,
  TaskGoalProgressRule,
} from '@memoflow/contracts/task';
import { TaskGoalProgressConfigurationSchema } from '@memoflow/contracts/task';
import type { GoalId, KeyResultId } from '@memoflow/contracts/primitives';

export class TaskGoalBinding extends ValueObject<TaskGoalLinkDTO> implements ITaskGoalLink {
  private constructor(props: TaskGoalLinkDTO) {
    super(props);
  }

  public static create(props: TaskGoalLinkInput): TaskGoalBinding {
    if (!props.goalId?.trim()) throw new Error('Goal ID is required');
    if (props.keyResultId != null && props.keyResultId.trim().length === 0) {
      throw new Error('Key Result ID cannot be empty');
    }
    const configuration = TaskGoalProgressConfigurationSchema.parse(props);
    if (configuration.progressRule && !props.keyResultId)
      throw new Error('Goal contribution requires a Key Result');
    const normalized = {
      goalId: props.goalId,
      keyResultId: props.keyResultId ?? null,
      ...configuration,
    };
    return new TaskGoalBinding(normalized);
  }

  public static bindToGoal(
    goalId: GoalId,
    keyResultId: KeyResultId | null = null,
    contribution: GoalContributionRule | null = null,
  ): TaskGoalBinding {
    return TaskGoalBinding.create({ goalId, keyResultId, contribution });
  }

  public static fromDTO(dto: TaskGoalLinkInput): TaskGoalBinding {
    return TaskGoalBinding.create(dto);
  }

  public get goalId(): GoalId {
    return this.props.goalId as GoalId;
  }

  public get keyResultId(): KeyResultId | null {
    return (this.props.keyResultId as KeyResultId | null) ?? null;
  }

  public get progressRule(): TaskGoalProgressRule | null {
    return this.props.progressRule ? { ...this.props.progressRule } : null;
  }

  public get contribution(): GoalContributionRule | null {
    const rule = this.progressRule;
    return rule?.mode === 'Fixed' ? { value: rule.value, trigger: rule.trigger } : null;
  }

  public get hasContribution(): boolean {
    return this.progressRule?.mode === 'Fixed';
  }

  public withContribution(contribution: GoalContributionRule | null): TaskGoalBinding {
    return TaskGoalBinding.create({
      goalId: this.goalId,
      keyResultId: this.keyResultId,
      contribution,
    });
  }

  public getDisplayText(): string {
    const kr = this.props.keyResultId ? `, KR: ${this.props.keyResultId}` : '';
    const rule = this.contribution;
    const contribution = rule
      ? `, Contribution: ${rule.value} (${rule.trigger})`
      : ', Contribution: off';
    return `Goal: ${this.props.goalId}${kr}${contribution}`;
  }

  public toDTO(): TaskGoalLinkDTO {
    return {
      goalId: this.props.goalId,
      keyResultId: this.props.keyResultId ?? null,
      progressRule: this.progressRule,
      contribution: this.contribution,
    };
  }
}
