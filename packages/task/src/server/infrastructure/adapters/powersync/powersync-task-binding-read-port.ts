import type { IElectronDatabase } from '@memoflow/contracts/electron';
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
  type TaskGoalContextPage,
  type TaskGoalContextPageRequest,
  type TaskGoalContextSummary,
} from '@memoflow/contracts/task';
import type { TaskGoalContextReadPort } from '../../../application/ports';

interface ContextRow {
  id: string;
  name: string;
  status: string;
  outcome: string;
  key_result_id: string | null;
  goal_record_value: number | null;
  goal_progress_trigger: string | null;
}

function toContextItem(row: ContextRow) {
  return TaskGoalContextItemSchema.parse({
    taskPlanId: row.id,
    name: row.name,
    status: row.status,
    outcome: row.outcome,
    keyResultId: row.key_result_id,
    hasContribution: row.goal_record_value != null && row.goal_progress_trigger != null,
  });
}

export class PowerSyncTaskBindingReadPort
  implements GoalDependencyReadPort, TaskGoalContextReadPort
{
  constructor(private readonly db: IElectronDatabase) {}

  async checkActiveTaskBindings(input: GoalTaskBindingQueryInput): Promise<{
    hasActiveBindings: boolean;
    activeCount: number;
  }> {
    const validated = GoalTaskBindingQueryInputSchema.parse(input);
    const rows = await this.db.getAll<{ count: number }>(
      'SELECT COUNT(*) as count FROM task_templates WHERE identity_id = ? AND goal_id = ? AND deleted_at IS NULL',
      [validated.identityId, validated.goalId],
    );
    const count = Number(rows[0]?.count ?? 0);
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
    return this.listContextPage(
      input.identityId,
      input.goalId,
      null,
      TaskGoalContextPageRequestSchema.parse(page),
    );
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
    return this.listContextPage(
      input.identityId,
      input.goalId,
      parsedKeyResultId,
      TaskGoalContextPageRequestSchema.parse(page),
    );
  }

  private async listContextPage(
    identityId: string,
    goalId: string,
    keyResultId: string | null,
    paging: { limit: number; offset: number },
  ): Promise<TaskGoalContextPage> {
    const keyResultClause = keyResultId === null ? '' : ' AND key_result_id = ?';
    const params: unknown[] = [identityId, goalId];
    if (keyResultId !== null) params.push(keyResultId);
    const rows = await this.db.getAll<ContextRow>(
      `SELECT id, name, status, outcome, key_result_id, goal_record_value, goal_progress_trigger
       FROM task_templates
       WHERE identity_id = ? AND goal_id = ?${keyResultClause} AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, paging.limit, paging.offset],
    );
    const counts = await this.db.getAll<{ count: number }>(
      `SELECT COUNT(*) as count FROM task_templates
       WHERE identity_id = ? AND goal_id = ?${keyResultClause} AND deleted_at IS NULL`,
      params,
    );
    return TaskGoalContextPageSchema.parse({
      items: rows.map(toContextItem),
      total: Number(counts[0]?.count ?? 0),
      limit: paging.limit,
      offset: paging.offset,
    });
  }

  async getTaskGoalContextSummary(
    identityId: string,
    goalId: string,
  ): Promise<TaskGoalContextSummary> {
    const input = GoalTaskBindingQueryInputSchema.parse({ identityId, goalId });
    const [summaryRows, grouped] = await Promise.all([
      this.db.getAll<{
        total: number;
        active: number;
        completed: number;
        goal_level: number;
      }>(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN outcome = 'Succeeded' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN key_result_id IS NULL THEN 1 ELSE 0 END) as goal_level
         FROM task_templates
         WHERE identity_id = ? AND goal_id = ? AND deleted_at IS NULL`,
        [input.identityId, input.goalId],
      ),
      this.db.getAll<{ key_result_id: string; total: number; active: number }>(
        `SELECT
           key_result_id,
           COUNT(*) as total,
           SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active
         FROM task_templates
         WHERE identity_id = ? AND goal_id = ? AND key_result_id IS NOT NULL AND deleted_at IS NULL
         GROUP BY key_result_id
         ORDER BY key_result_id ASC`,
        [input.identityId, input.goalId],
      ),
    ]);
    const row = summaryRows[0];
    return TaskGoalContextSummarySchema.parse({
      total: Number(row?.total ?? 0),
      active: Number(row?.active ?? 0),
      completed: Number(row?.completed ?? 0),
      goalLevel: Number(row?.goal_level ?? 0),
      byKeyResult: grouped.map((group) => ({
        keyResultId: group.key_result_id,
        total: Number(group.total),
        active: Number(group.active),
      })),
    });
  }
}
