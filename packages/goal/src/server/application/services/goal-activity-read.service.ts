import type { IGoalRepository } from '../../domain/repositories/i-goal-repository';

const DEFAULT_ACTIVITY_LIMIT = 10;

export interface GoalActivityReadOptions {
  /** Inclusive lower bound expressed as a Product Time instant. */
  readonly since: number;
  readonly limit?: number;
}

export interface GoalActivityItem {
  readonly id: string;
  readonly type: 'goal_updated';
  readonly description: string;
  readonly timestamp: number;
}

export interface GoalActivityReadServiceDependencies {
  readonly goalRepository: IGoalRepository;
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_ACTIVITY_LIMIT;
  return Math.max(1, Math.min(DEFAULT_ACTIVITY_LIMIT, Math.trunc(limit)));
}

/**
 * Read-only, identity-scoped goal activity projection.
 *
 * Goal owns the mapping from its own facts to the lightweight host-facing
 * activity entries. Hosts consume the pre-projected items and never touch
 * goal persistence shapes.
 */
export class GoalActivityReadService {
  constructor(private readonly dependencies: GoalActivityReadServiceDependencies) {}

  async listRecentActivity(
    identityId: string,
    options: GoalActivityReadOptions,
  ): Promise<GoalActivityItem[]> {
    const goals = await this.dependencies.goalRepository.findByIdentityId(identityId, {
      includeChildren: false,
      systemView: 'active',
    });

    return goals
      .flatMap((goal): GoalActivityItem[] => {
        const timestamp = Number(goal.updatedAt);
        if (goal.deletedAt !== null || timestamp < options.since) return [];
        return [
          {
            id: `goal-updated-${String(goal.id)}`,
            type: 'goal_updated',
            description: `更新了目标「${goal.name}」的进度`,
            timestamp,
          },
        ];
      })
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, boundedLimit(options.limit));
  }
}
