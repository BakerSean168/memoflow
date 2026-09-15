/**
 * App-local AI host adapter (API lane).
 * apps/api 本地的 AI 宿主适配器（API lane）。
 *
 * Import seam: this adapter consumes the public `@memoflow/ai/ports` seam and
 * other package roots/`/analytics` seams. It must never import the
 * package-internal `/server` subpath (any deep package-internal path). Only
 * `apps/api/src/runtime/compose-ai.ts` imports the package `/api` transport
 * seam; app-local adapters stay behind the port interfaces.
 *
 * 导入边界：本适配器只使用公开的 `@memoflow/ai/ports` seam 与其他包根/`/analytics`
 * seam，绝不导入包内 `/server` 子路径（或任何包内深路径）。只有
 * `apps/api/src/runtime/compose-ai.ts` 导入 package `/api` transport seam；
 * app-local adapter 保持在 port 接口之后。
 */
import type { IAnalyticsReadPort } from '@memoflow/ai/ports';
import type { PrismaClient } from '@memoflow/database';
import type { UserTimeContextPort } from '@memoflow/time';
import { SearchGoalsUseCase } from '@memoflow/goal/analytics';
import { createGoalPrismaModule } from '@memoflow/goal';
import { PrismaTaskBindingReadPort } from '@memoflow/task';
import { PrismaGoalRelationCleanupCapability } from '@memoflow/relation';
import { GetTaskDashboardUseCase } from '@memoflow/task/analytics';
import { createTaskPrismaRepositories } from '@memoflow/task';

import { getApiDashboardData } from '../dashboard/dashboard-read-service';

export class ControlledAnalyticsReadAdapter implements IAnalyticsReadPort {
  constructor(
    private readonly db: PrismaClient,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {}

  async buildContext(identityId: string, question: string) {
    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    const goalModule = createGoalPrismaModule(this.db, {
      taskBindingReadPort: new PrismaTaskBindingReadPort(this.db),
      userTimeContextPort: this.userTimeContextPort,
      relationCleanupFactory: (tx) => new PrismaGoalRelationCleanupCapability(tx),
    });
    const taskRepos = createTaskPrismaRepositories(this.db);
    const dashboard = await getApiDashboardData(this.db, identityId, this.userTimeContextPort);
    const taskDashboard = await new GetTaskDashboardUseCase(
      taskRepos.taskPlanRepository,
      taskRepos.taskOccurrenceRepository,
      this.userTimeContextPort,
    ).execute(identityId);
    const activeGoals = await goalModule.goalRepository.findByIdentityId(identityId, {
      includeChildren: true,
      systemView: 'active',
    });
    const goalSearch = await new SearchGoalsUseCase(goalModule.goalRepository).execute(
      identityId,
      question,
      'active',
    );

    return {
      timeContext,
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
