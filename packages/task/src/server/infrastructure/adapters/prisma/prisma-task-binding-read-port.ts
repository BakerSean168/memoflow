import type { PrismaClient } from '@memoflow/database';
import {
  GoalTaskBindingQueryInputSchema,
  type GoalDependencyReadPort,
  type GoalTaskBindingQueryInput,
} from '@memoflow/contracts/reliable-messaging';
import {
  TaskGoalContextItemSchema,
  TaskGoalContextPageRequestSchema,
  TaskGoalContextPageSchema,
  TaskGoalContextSummarySchema,
  TaskPlanOutcome,
  TaskPlanStatus,
  type TaskGoalContextPage,
  type TaskGoalContextPageRequest,
  type TaskGoalContextSummary,
} from '@memoflow/contracts/task';
import type { TaskGoalContextReadPort } from '../../../application/ports';

const contextSelect = {
  id: true,
  name: true,
  status: true,
  outcome: true,
  keyResultId: true,
  goalRecordValue: true,
  goalProgressTrigger: true,
} as const;

function toContextItem(row: {
  id: string;
  name: string;
  status: string;
  outcome: string;
  keyResultId: string | null;
  goalRecordValue: number | null;
  goalProgressTrigger: string | null;
}) {
  return TaskGoalContextItemSchema.parse({
    taskPlanId: row.id,
    name: row.name,
    status: row.status,
    outcome: row.outcome,
    keyResultId: row.keyResultId,
    hasContribution: row.goalRecordValue != null && row.goalProgressTrigger != null,
  });
}

export class PrismaTaskBindingReadPort implements GoalDependencyReadPort, TaskGoalContextReadPort {
  constructor(private readonly db: PrismaClient) {}

  async checkActiveTaskBindings(input: GoalTaskBindingQueryInput): Promise<{
    hasActiveBindings: boolean;
    activeCount: number;
  }> {
    const validated = GoalTaskBindingQueryInputSchema.parse(input);
    const count = await this.db.taskPlan.count({
      where: {
        identityId: validated.identityId,
        goalId: validated.goalId,
        deletedAt: null,
      },
    });
    return {
      hasActiveBindings: count > 0,
      activeCount: count,
    };
  }

  async listTasksByGoal(
    identityId: string,
    goalId: string,
    page: TaskGoalContextPageRequest = {},
  ): Promise<TaskGoalContextPage> {
    const input = GoalTaskBindingQueryInputSchema.parse({ identityId, goalId });
    const paging = TaskGoalContextPageRequestSchema.parse(page);
    const where = { identityId: input.identityId, goalId: input.goalId, deletedAt: null } as const;
    const [rows, total] = await Promise.all([
      this.db.taskPlan.findMany({
        where,
        select: contextSelect,
        orderBy: { createdAt: 'desc' },
        take: paging.limit,
        skip: paging.offset,
      }),
      this.db.taskPlan.count({ where }),
    ]);
    return TaskGoalContextPageSchema.parse({
      items: rows.map(toContextItem),
      total,
      limit: paging.limit,
      offset: paging.offset,
    });
  }

  async listTasksByKeyResult(
    identityId: string,
    goalId: string,
    keyResultId: string,
    page: TaskGoalContextPageRequest = {},
  ): Promise<TaskGoalContextPage> {
    const input = GoalTaskBindingQueryInputSchema.parse({ identityId, goalId });
    const parsedKeyResultId = String(keyResultId).trim();
    if (!parsedKeyResultId) throw new TypeError('keyResultId is required');
    const paging = TaskGoalContextPageRequestSchema.parse(page);
    const where = {
      identityId: input.identityId,
      goalId: input.goalId,
      keyResultId: parsedKeyResultId,
      deletedAt: null,
    } as const;
    const [rows, total] = await Promise.all([
      this.db.taskPlan.findMany({
        where,
        select: contextSelect,
        orderBy: { createdAt: 'desc' },
        take: paging.limit,
        skip: paging.offset,
      }),
      this.db.taskPlan.count({ where }),
    ]);
    return TaskGoalContextPageSchema.parse({
      items: rows.map(toContextItem),
      total,
      limit: paging.limit,
      offset: paging.offset,
    });
  }

  async getTaskGoalContextSummary(
    identityId: string,
    goalId: string,
  ): Promise<TaskGoalContextSummary> {
    const input = GoalTaskBindingQueryInputSchema.parse({ identityId, goalId });
    const base = { identityId: input.identityId, goalId: input.goalId, deletedAt: null } as const;
    const [total, active, completed, goalLevel, grouped, activeGrouped] = await Promise.all([
      this.db.taskPlan.count({ where: base }),
      this.db.taskPlan.count({ where: { ...base, status: TaskPlanStatus.Active } }),
      this.db.taskPlan.count({ where: { ...base, outcome: TaskPlanOutcome.Succeeded } }),
      this.db.taskPlan.count({ where: { ...base, keyResultId: null } }),
      this.db.taskPlan.groupBy({
        by: ['keyResultId'],
        where: { ...base, keyResultId: { not: null } },
        _count: { _all: true },
      }),
      this.db.taskPlan.groupBy({
        by: ['keyResultId'],
        where: { ...base, keyResultId: { not: null }, status: TaskPlanStatus.Active },
        _count: { _all: true },
      }),
    ]);
    const activeByKeyResult = new Map(
      activeGrouped.map((row) => [String(row.keyResultId), row._count._all]),
    );
    return TaskGoalContextSummarySchema.parse({
      total,
      active,
      completed,
      goalLevel,
      byKeyResult: grouped
        .filter((row) => row.keyResultId != null)
        .map((row) => ({
          keyResultId: String(row.keyResultId),
          total: row._count._all,
          active: activeByKeyResult.get(String(row.keyResultId)) ?? 0,
        }))
        .sort((a, b) =>
          a.keyResultId < b.keyResultId ? -1 : a.keyResultId > b.keyResultId ? 1 : 0,
        ),
    });
  }
}
