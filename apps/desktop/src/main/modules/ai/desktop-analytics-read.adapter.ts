import type { IAnalyticsReadPort } from '@memoflow/ai/ports';
import { SearchGoalsUseCase } from '@memoflow/goal/analytics';
import type { IGoalRepository } from '@memoflow/goal';
import { GetTaskDashboardUseCase } from '@memoflow/task/analytics';
import type { ITaskOccurrenceRepository, ITaskPlanRepository } from '@memoflow/task';
import type { DashboardData } from '@memoflow/contracts/dashboard';

/**
 * Instance-bound dependencies for the desktop analytics read adapter.
 * desktop analytics read adapter 的 instance-bound 依赖。
 *
 * The Goal/Task repositories are the exact instances owned by the desktop
 * composition root, injected explicitly instead of read through package-level
 * globals; the dashboard loader composes them with the task instance repository
 * for the aggregation.
 *
 * Goal/Task 仓储是 desktop 组合根拥有的确切实例，通过显式注入而非包级全局读取；
 * dashboard loader 在聚合时把它们与 task instance 仓储组合起来。
 */
export interface DesktopAnalyticsReadAdapterDependencies {
  readonly goalRepository: IGoalRepository;
  readonly taskPlanRepository: ITaskPlanRepository;
  readonly taskOccurrenceRepository: ITaskOccurrenceRepository;
  /** Loads the dashboard aggregation for an identity through injected repositories. 通过注入的仓储为某个 identity 加载 dashboard 聚合。 */
  readonly dashboardDataLoader: (identityId: string) => Promise<DashboardData>;
}

export class DesktopAnalyticsReadAdapter implements IAnalyticsReadPort {
  constructor(private readonly dependencies: DesktopAnalyticsReadAdapterDependencies) {}

  async buildContext(identityId: string, question: string) {
    const { goalRepository, taskPlanRepository, taskOccurrenceRepository } = this.dependencies;
    const dashboard = await this.dependencies.dashboardDataLoader(identityId);
    const taskDashboard = await new GetTaskDashboardUseCase(
      taskPlanRepository,
      taskOccurrenceRepository,
    ).execute(identityId);
    const activeGoals = await goalRepository.findByIdentityId(identityId, {
      includeChildren: true,
      systemView: 'active',
    });
    const goalSearch = await new SearchGoalsUseCase(goalRepository).execute(
      identityId,
      question,
      'active',
    );

    return {
      dashboard: dashboard as unknown as Record<string, unknown>,
      taskDashboard: taskDashboard.ok
        ? (taskDashboard.data as unknown as Record<string, unknown>)
        : undefined,
      goals: activeGoals
        .slice(0, 10)
        .map((goal) => goal.toClientDTO(true) as unknown as Record<string, unknown>),
      goalSearchResults: goalSearch.ok
        ? goalSearch.data.data.map((goal) => goal as unknown as Record<string, unknown>)
        : [],
      extra: {},
    };
  }
}
