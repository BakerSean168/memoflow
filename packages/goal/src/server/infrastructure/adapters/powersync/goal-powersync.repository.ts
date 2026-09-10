import {
  GoalLabelOwnershipError,
  GoalVersionConflictError,
  type IGoalRepository,
} from '../../../domain';
import { Goal } from '../../../domain';
import type { GoalSystemView, KeyResultWeightSnapshotDTO } from '@memoflow/contracts/goal';
import { LabelColorSchema, type LabelDto } from '@memoflow/contracts/label';
import {
  AggregateRepositoryBase,
  createEventBusAdapter,
  publishAggregateEvents,
  type IEventBus,
} from '@memoflow/patterns';
import { eventBus } from '@memoflow/utils/domain';
import type { GoalPowerSyncDatabase, PowerSyncLockContext } from './shared';
import { toDbDateTime } from './shared';
import { PowerSyncGoalMapper } from './mappers/powersync-goal.mapper';
import type { RawKeyResultData, RawGoalReviewData } from './mappers/powersync-goal.mapper';

const eventBusAdapter = createEventBusAdapter(eventBus);

export class GoalPowerSyncRepository
  extends AggregateRepositoryBase<Goal>
  implements IGoalRepository
{
  constructor(
    private readonly db: GoalPowerSyncDatabase | PowerSyncLockContext,
    eventBus: IEventBus = eventBusAdapter,
    private readonly transactionBound = false,
  ) {
    super(eventBus);
  }

  private static labelDto(row: Record<string, unknown>): LabelDto {
    return {
      id: String(row.id),
      identityId: String(row.identity_id),
      name: String(row.name),
      normalizedName: String(row.normalized_name),
      color: row.color == null ? null : LabelColorSchema.parse(String(row.color)),
      createdAt: Date.parse(String(row.created_at)),
      updatedAt: Date.parse(String(row.updated_at)),
    };
  }

  private async loadLabelMap(
    identityId: string,
    goalIds: readonly string[],
  ): Promise<Map<string, LabelDto[]>> {
    const ids = [...new Set(goalIds)];
    const result = new Map(ids.map((id) => [id, [] as LabelDto[]]));
    if (ids.length === 0) return result;
    const placeholders = ids.map(() => '?').join(', ');
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT l.*, gl.goal_id AS owner_id
       FROM labels l
       INNER JOIN goal_labels gl ON gl.label_id = l.id AND gl.identity_id = l.identity_id
       WHERE gl.identity_id = ? AND gl.goal_id IN (${placeholders})
       ORDER BY gl.goal_id ASC, l.name ASC, l.id ASC`,
      [identityId, ...ids],
    );
    for (const row of rows)
      result.get(String(row.owner_id))?.push(GoalPowerSyncRepository.labelDto(row));
    return result;
  }

  async replaceLabels(
    identityId: string,
    goalId: string,
    labelIds: readonly string[],
  ): Promise<LabelDto[]> {
    const work = async (tx: PowerSyncLockContext): Promise<LabelDto[]> => {
      const owner = await tx.getOptional<{ id: string }>(
        'SELECT id FROM goals WHERE id = ? AND identity_id = ? LIMIT 1',
        [goalId, identityId],
      );
      if (!owner) throw new Error('Goal not found.');
      const uniqueIds = [...new Set(labelIds)];
      for (const labelId of uniqueIds) {
        const label = await tx.getOptional<{ id: string }>(
          'SELECT id FROM labels WHERE id = ? AND identity_id = ? LIMIT 1',
          [labelId, identityId],
        );
        if (!label) throw new GoalLabelOwnershipError();
      }
      await tx.execute('DELETE FROM goal_labels WHERE identity_id = ? AND goal_id = ?', [
        identityId,
        goalId,
      ]);
      for (const labelId of uniqueIds) {
        await tx.execute(
          'INSERT INTO goal_labels (id, identity_id, goal_id, label_id) VALUES (?, ?, ?, ?)',
          [`${identityId}:${goalId}:${labelId}`, identityId, goalId, labelId],
        );
      }
      const labels = await tx.getAll<Record<string, unknown>>(
        `SELECT l.* FROM labels l
         INNER JOIN goal_labels gl ON gl.label_id = l.id AND gl.identity_id = l.identity_id
         WHERE gl.identity_id = ? AND gl.goal_id = ? ORDER BY l.name ASC, l.id ASC`,
        [identityId, goalId],
      );
      return labels.map(GoalPowerSyncRepository.labelDto);
    };
    if (this.transactionBound) return work(this.db as PowerSyncLockContext);
    return (this.db as GoalPowerSyncDatabase).writeTransaction(work);
  }

  async findByIdForIdentity(
    identityId: string,
    id: string,
    options?: { includeChildren?: boolean },
  ): Promise<Goal | null> {
    const row = await this.db.getOptional<Record<string, unknown>>(
      `SELECT * FROM goals WHERE id = ? AND identity_id = ? LIMIT 1`,
      [id, identityId],
    );

    if (!row) return null;
    return this.toGoal(row, options?.includeChildren ?? false);
  }

  async findByIdentityId(
    identityId: string,
    options?: {
      includeChildren?: boolean;
      status?: string;
      systemView?: GoalSystemView;
      labelIdsAll?: readonly string[];
    },
  ): Promise<Goal[]> {
    const params: unknown[] = [identityId];
    const filters = ['g.identity_id = ?', 'g.deleted_at IS NULL', 'g.archived_at IS NULL'];

    switch (options?.systemView) {
      case 'active':
        filters.push("g.status = 'Active'");
        break;
      case 'completed':
        filters.push("g.status = 'Completed'");
        break;
      case 'abandoned':
        filters.push("g.status = 'Abandoned'");
        break;
      case 'archived':
        filters.splice(filters.indexOf('g.archived_at IS NULL'), 1);
        filters.push('g.archived_at IS NOT NULL');
        break;
      case 'all':
      case undefined:
        break;
    }

    if (options?.status) {
      filters.push('g.status = ?');
      params.push(options.status);
    }

    const requiredLabelIds = [...new Set(options?.labelIdsAll ?? [])];
    if (requiredLabelIds.length > 0) {
      const placeholders = requiredLabelIds.map(() => '?').join(', ');
      const matches = await this.db.getAll<{ goal_id: string }>(
        `SELECT goal_id FROM goal_labels
         WHERE identity_id = ? AND label_id IN (${placeholders})
         GROUP BY goal_id
         HAVING COUNT(DISTINCT label_id) = ?`,
        [identityId, ...requiredLabelIds, requiredLabelIds.length],
      );
      if (matches.length === 0) return [];
      const goalPlaceholders = matches.map(() => '?').join(', ');
      filters.push(`g.id IN (${goalPlaceholders})`);
      params.push(...matches.map((row) => row.goal_id));
    }

    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT g.*
       FROM goals g
       WHERE ${filters.join(' AND ')}
       ORDER BY g.sort_order ASC, g.created_at DESC`,
      params,
    );

    const labelMap = await this.loadLabelMap(
      identityId,
      rows.map((row) => String(row.id)),
    );
    return Promise.all(
      rows.map((row) =>
        this.toGoal(row, options?.includeChildren ?? true, labelMap.get(String(row.id)) ?? []),
      ),
    );
  }

  async findByKeyResultIdForIdentity(
    identityId: string,
    keyResultId: string,
  ): Promise<Goal | null> {
    const row = await this.db.getOptional<{ goal_id: string }>(
      `SELECT goal_id FROM key_results WHERE id = ? LIMIT 1`,
      [keyResultId],
    );
    return row
      ? this.findByIdForIdentity(identityId, row.goal_id, { includeChildren: true })
      : null;
  }

  protected async persist(goal: Goal): Promise<void> {
    const dto = goal.toServerDTO(true);

    const persistInTransaction = async (tx: PowerSyncLockContext) => {
      const existingGoal = await tx.getOptional<{ id: string }>(
        `SELECT id FROM goals WHERE id = ? LIMIT 1`,
        [dto.id],
      );

      if (existingGoal) {
        await tx.execute(
          `UPDATE goals
           SET identity_id = ?,
               name = ?,
               description = ?,
               feasibility_analysis = ?,
               motivation = ?,
               status = ?,
               start_date = ?,
               due_date = ?,
               completed_at = ?,
               archived_at = ?,
               sort_order = ?,
               reminder_config = ?,
               version = ?,
               updated_at = ?,
               deleted_at = ?
           WHERE id = ?`,
          [
            dto.identityId,
            dto.name,
            dto.description,
            dto.feasibilityAnalysis,
            dto.motivation,
            dto.status,
            toDbDateTime(dto.startDate),
            toDbDateTime(dto.dueDate),
            toDbDateTime(dto.completedAt),
            toDbDateTime(dto.archivedAt),
            dto.sortOrder,
            dto.reminderConfig ? JSON.stringify(dto.reminderConfig) : null,
            dto.version,
            toDbDateTime(dto.updatedAt),
            toDbDateTime(dto.deletedAt),
            dto.id,
          ],
        );
      } else {
        await tx.execute(
          `INSERT INTO goals (
             id, identity_id, name, description, feasibility_analysis, motivation, status,
             start_date, due_date, completed_at, archived_at, sort_order, reminder_config,
             version, created_at, updated_at, deleted_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dto.id,
            dto.identityId,
            dto.name,
            dto.description,
            dto.feasibilityAnalysis,
            dto.motivation,
            dto.status,
            toDbDateTime(dto.startDate),
            toDbDateTime(dto.dueDate),
            toDbDateTime(dto.completedAt),
            toDbDateTime(dto.archivedAt),
            dto.sortOrder,
            dto.reminderConfig ? JSON.stringify(dto.reminderConfig) : null,
            dto.version,
            toDbDateTime(dto.createdAt),
            toDbDateTime(dto.updatedAt),
            toDbDateTime(dto.deletedAt),
          ],
        );
      }

      await this.syncKeyResults(
        tx,
        dto.id as string,
        dto.identityId as string,
        dto.keyResults ?? [],
      );
      await this.syncGoalReviews(
        tx,
        dto.id as string,
        dto.identityId as string,
        dto.goalReviews ?? [],
      );
      await this.syncWeightSnapshots(
        tx,
        dto.id as string,
        dto.identityId as string,
        dto.weightSnapshots ?? [],
      );
    };

    if (this.transactionBound) {
      await persistInTransaction(this.db as PowerSyncLockContext);
      return;
    }

    await (this.db as GoalPowerSyncDatabase).writeTransaction(persistInTransaction);
  }

  async saveRootWithExpectedVersion(goal: Goal, expectedVersion: number): Promise<void> {
    if (!this.transactionBound) {
      await (this.db as GoalPowerSyncDatabase).writeTransaction(async (tx) => {
        const repository = new GoalPowerSyncRepository(tx, this.eventBus, true);
        await repository.persistWithExpectedVersion(goal, expectedVersion);
      });
      await publishAggregateEvents(goal, { eventBus: this.eventBus });
      return;
    }

    await this.persistWithExpectedVersion(goal, expectedVersion);
    await publishAggregateEvents(goal, { eventBus: this.eventBus });
  }

  private async persistWithExpectedVersion(goal: Goal, expectedVersion: number): Promise<void> {
    const dto = goal.toServerDTO(false);
    const result = await this.db.execute(
      `UPDATE goals SET name = ?, description = ?, feasibility_analysis = ?, motivation = ?,
       status = ?, start_date = ?, due_date = ?, completed_at = ?, archived_at = ?,
       reminder_config = ?, version = ?, updated_at = ?, deleted_at = ?
       WHERE id = ? AND identity_id = ? AND version = ?`,
      [
        dto.name,
        dto.description,
        dto.feasibilityAnalysis,
        dto.motivation,
        dto.status,
        toDbDateTime(dto.startDate),
        toDbDateTime(dto.dueDate),
        toDbDateTime(dto.completedAt),
        toDbDateTime(dto.archivedAt),
        dto.reminderConfig ? JSON.stringify(dto.reminderConfig) : null,
        dto.version,
        toDbDateTime(dto.updatedAt),
        toDbDateTime(dto.deletedAt),
        dto.id,
        dto.identityId,
        expectedVersion,
      ],
    );
    if (result.rowsAffected !== 1) throw new GoalVersionConflictError();
    await this.persist(goal);
  }

  async delete(identityId: string, id: string): Promise<void> {
    const existing = await this.findByIdForIdentity(identityId, id);
    if (!existing) {
      throw new Error('Goal not found for the current identity.');
    }
    await (this.db as GoalPowerSyncDatabase).writeTransaction(async (tx) => {
      await tx.execute(`DELETE FROM goal_reviews WHERE goal_id = ?`, [id]);
      await tx.execute(
        `DELETE FROM goal_records
         WHERE key_result_id IN (SELECT id FROM key_results WHERE goal_id = ?)`,
        [id],
      );
      await tx.execute(`DELETE FROM key_results WHERE goal_id = ?`, [id]);
      await tx.execute(`DELETE FROM key_result_weight_snapshots WHERE goal_id = ?`, [id]);
      await tx.execute(`DELETE FROM goals WHERE id = ? AND identity_id = ?`, [id, identityId]);
    });
  }

  async deleteWithExpectedVersion(
    identityId: string,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    await (this.db as GoalPowerSyncDatabase).writeTransaction(async (tx) => {
      await tx.execute(`DELETE FROM goal_reviews WHERE goal_id = ?`, [id]);
      await tx.execute(
        `DELETE FROM goal_records
         WHERE key_result_id IN (SELECT id FROM key_results WHERE goal_id = ?)`,
        [id],
      );
      await tx.execute(`DELETE FROM key_results WHERE goal_id = ?`, [id]);
      await tx.execute(`DELETE FROM key_result_weight_snapshots WHERE goal_id = ?`, [id]);
      const deleted = await tx.execute(
        `DELETE FROM goals WHERE id = ? AND identity_id = ? AND version = ?`,
        [id, identityId, expectedVersion],
      );
      if (deleted.rowsAffected !== 1) throw new GoalVersionConflictError();
    });
  }

  async exists(identityId: string, id: string): Promise<boolean> {
    return (await this.findByIdForIdentity(identityId, id)) !== null;
  }

  async findAllGoalRefs(): Promise<Array<{ id: string; identityId: string }>> {
    // Local PowerSync host owns exactly one identity's rows; enumerate every row so
    // startup reconcile projects the same authoritative set as the Prisma lane.
    const rows = await this.db.getAll<{ id: string; identity_id: string }>(
      `SELECT id, identity_id FROM goals ORDER BY id ASC`,
      [],
    );
    return rows.map((row) => ({ id: String(row.id), identityId: String(row.identity_id) }));
  }

  async batchUpdateStatus(identityId: string, ids: string[], status: string): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    await this.db.execute(
      `UPDATE goals SET status = ?, updated_at = ? WHERE identity_id = ? AND id IN (${placeholders})`,
      [status, toDbDateTime(new Date()), identityId, ...ids],
    );
  }

  private async toGoal(
    row: Record<string, unknown>,
    includeChildren: boolean,
    labels?: readonly LabelDto[],
  ): Promise<Goal> {
    const children = includeChildren
      ? {
          keyResults: await this.loadKeyResults(String(row.id)),
          goalReviews: await this.loadGoalReviews(String(row.id)),
          weightSnapshots: await this.loadWeightSnapshots(String(row.id)),
        }
      : undefined;

    const goal = PowerSyncGoalMapper.toDomain(row, children);
    const projection =
      labels ??
      (await this.loadLabelMap(String(row.identity_id), [String(row.id)])).get(String(row.id)) ??
      [];
    goal.hydrateLabels(projection);
    return goal;
  }

  private async loadKeyResults(goalId: string): Promise<RawKeyResultData[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT *
       FROM key_results
       WHERE goal_id = ?
       ORDER BY "order" ASC`,
      [goalId],
    );

    return rows.map((row) => PowerSyncGoalMapper.mapKeyResultRow(row));
  }

  private async loadGoalReviews(goalId: string): Promise<RawGoalReviewData[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT *
       FROM goal_reviews
       WHERE goal_id = ?
       ORDER BY created_at DESC`,
      [goalId],
    );

    return rows.map((row) => PowerSyncGoalMapper.mapGoalReviewRow(row));
  }

  private async loadWeightSnapshots(goalId: string): Promise<KeyResultWeightSnapshotDTO[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT *
       FROM key_result_weight_snapshots
       WHERE goal_id = ?
       ORDER BY snapshot_time DESC`,
      [goalId],
    );

    return rows.map((row) => PowerSyncGoalMapper.mapWeightSnapshotRow(row));
  }

  private async syncKeyResults(
    tx: PowerSyncLockContext,
    goalId: string,
    identityId: string,
    keyResults: NonNullable<ReturnType<Goal['toServerDTO']>['keyResults']>,
  ): Promise<void> {
    const ids = keyResults.map((kr) => String(kr.id));

    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(', ');
      await tx.execute(
        `DELETE FROM goal_records
         WHERE key_result_id IN (
           SELECT id FROM key_results WHERE goal_id = ? AND id NOT IN (${placeholders})
         )`,
        [goalId, ...ids],
      );
      await tx.execute(
        `DELETE FROM key_results WHERE goal_id = ? AND id NOT IN (${placeholders})`,
        [goalId, ...ids],
      );
    } else {
      await tx.execute(
        `DELETE FROM goal_records WHERE key_result_id IN (SELECT id FROM key_results WHERE goal_id = ?)`,
        [goalId],
      );
      await tx.execute(`DELETE FROM key_results WHERE goal_id = ?`, [goalId]);
    }

    for (const keyResult of keyResults) {
      const progress =
        typeof keyResult.progress === 'string'
          ? JSON.parse(keyResult.progress)
          : keyResult.progress;

      const existingKeyResult = await tx.getOptional<{ id: string }>(
        `SELECT id FROM key_results WHERE id = ? LIMIT 1`,
        [keyResult.id],
      );

      if (existingKeyResult) {
        await tx.execute(
          `UPDATE key_results
           SET identity_id = ?,
               goal_id = ?,
               title = ?,
               description = ?,
               aggregation_method = ?,
               starting_value = ?,
               progress_baseline_value = ?,
               target_value = ?,
               current_value = ?,
               unit = ?,
               weight = ?,
               "order" = ?,
               updated_at = ?
           WHERE id = ?`,
          [
            identityId,
            goalId,
            keyResult.title,
            keyResult.description,
            progress.aggregationMethod ?? 'Last',
            progress.startingValue ?? 0,
            progress.progressBaselineValue ?? null,
            progress.targetValue ?? 100,
            progress.currentValue ?? 0,
            progress.unit ?? null,
            keyResult.weight,
            keyResult.sortOrder,
            toDbDateTime(keyResult.updatedAt),
            keyResult.id,
          ],
        );
      } else {
        await tx.execute(
          `INSERT INTO key_results (
             id, identity_id, goal_id, title, description, aggregation_method,
             starting_value, progress_baseline_value, target_value, current_value,
             unit, weight, "order", created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            keyResult.id,
            identityId,
            goalId,
            keyResult.title,
            keyResult.description,
            progress.aggregationMethod ?? 'Last',
            progress.startingValue ?? 0,
            progress.progressBaselineValue ?? null,
            progress.targetValue ?? 100,
            progress.currentValue ?? 0,
            progress.unit ?? null,
            keyResult.weight,
            keyResult.sortOrder,
            toDbDateTime(keyResult.createdAt),
            toDbDateTime(keyResult.updatedAt),
          ],
        );
      }
    }
  }

  private async syncGoalReviews(
    tx: PowerSyncLockContext,
    goalId: string,
    identityId: string,
    goalReviews: NonNullable<ReturnType<Goal['toServerDTO']>['goalReviews']>,
  ): Promise<void> {
    const ids = goalReviews.map((review) => String(review.id));

    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(', ');
      await tx.execute(
        `DELETE FROM goal_reviews WHERE goal_id = ? AND id NOT IN (${placeholders})`,
        [goalId, ...ids],
      );
    } else {
      await tx.execute(`DELETE FROM goal_reviews WHERE goal_id = ?`, [goalId]);
    }

    for (const review of goalReviews) {
      const existingReview = await tx.getOptional<{ id: string }>(
        `SELECT id FROM goal_reviews WHERE id = ? LIMIT 1`,
        [review.id],
      );

      if (existingReview) {
        await tx.execute(
          `UPDATE goal_reviews
           SET identity_id = ?,
               goal_id = ?,
               reflection = ?,
               challenges = ?,
               adjustments = ?,
               system_context = ?,
               reviewed_at = ?,
               updated_at = ?
           WHERE id = ?`,
          [
            identityId,
            goalId,
            review.reflection,
            review.challenges,
            review.adjustments,
            JSON.stringify(review.systemContext),
            toDbDateTime(review.reviewedAt),
            toDbDateTime(review.updatedAt),
            review.id,
          ],
        );
      } else {
        await tx.execute(
          `INSERT INTO goal_reviews (
             id, identity_id, goal_id, reflection, challenges, adjustments,
             system_context, reviewed_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            review.id,
            identityId,
            goalId,
            review.reflection,
            review.challenges,
            review.adjustments,
            JSON.stringify(review.systemContext),
            toDbDateTime(review.reviewedAt),
            toDbDateTime(review.createdAt),
            toDbDateTime(review.updatedAt),
          ],
        );
      }
    }
  }

  private async syncWeightSnapshots(
    tx: PowerSyncLockContext,
    goalId: string,
    identityId: string,
    weightSnapshots: NonNullable<ReturnType<Goal['toServerDTO']>['weightSnapshots']>,
  ): Promise<void> {
    for (const snapshot of weightSnapshots) {
      await tx.execute(
        `INSERT OR IGNORE INTO key_result_weight_snapshots (
           id, identity_id, goal_id, key_result_id, old_weight, new_weight,
           weight_delta, snapshot_time, trigger, reason, operator_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          snapshot.id,
          snapshot.identityId ?? identityId,
          goalId,
          snapshot.keyResultId,
          snapshot.oldWeight,
          snapshot.newWeight,
          snapshot.weightDelta,
          toDbDateTime(snapshot.snapshotTime),
          snapshot.trigger,
          snapshot.reason,
          snapshot.operatorId,
          toDbDateTime(snapshot.createdAt),
        ],
      );
    }
  }
}
