import type { IGoalRecordRepository, GoalRecordQueryOptions } from '../../../domain';
import { GoalRecord } from '../../../domain';
import type { GoalPowerSyncDatabase, PowerSyncLockContext } from './shared';
import { toDbDateTime } from './shared';
import { PowerSyncGoalRecordMapper } from './mappers/powersync-goal-record.mapper';
import type { GoalRecordSourceTypeValue } from '@memoflow/contracts/goal';

function buildTimeFilters(options?: GoalRecordQueryOptions): {
  clauses: string[];
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options?.startTime) {
    clauses.push('recorded_at >= ?');
    params.push(toDbDateTime(options.startTime));
  }

  if (options?.endTime) {
    clauses.push('recorded_at <= ?');
    params.push(toDbDateTime(options.endTime));
  }

  return { clauses, params };
}

export class GoalRecordPowerSyncRepository implements IGoalRecordRepository {
  constructor(private readonly db: GoalPowerSyncDatabase | PowerSyncLockContext) {}

  async findByKeyResultId(
    identityId: string,
    keyResultId: string,
    options?: GoalRecordQueryOptions,
  ): Promise<GoalRecord[]> {
    const { clauses, params } = buildTimeFilters(options);
    const orderDir = options?.orderBy === 'desc' ? 'DESC' : 'ASC';
    const limitClause = options?.limit ? ' LIMIT ?' : '';

    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT *
       FROM goal_records
       WHERE identity_id = ?
         AND key_result_id = ?
         ${clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : ''}
       ORDER BY recorded_at ${orderDir}, id ${orderDir}${limitClause}`,
      options?.limit
        ? [identityId, keyResultId, ...params, options.limit]
        : [identityId, keyResultId, ...params],
    );

    return rows.map((row) => PowerSyncGoalRecordMapper.toDomain(row));
  }

  async findByGoalId(
    identityId: string,
    goalId: string,
    options?: GoalRecordQueryOptions,
  ): Promise<GoalRecord[]> {
    const { clauses, params } = buildTimeFilters(options);
    const orderDir = options?.orderBy === 'desc' ? 'DESC' : 'ASC';
    const limitClause = options?.limit ? ' LIMIT ?' : '';

    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT gr.*
       FROM goal_records gr
       INNER JOIN key_results kr ON kr.id = gr.key_result_id
       WHERE gr.identity_id = ?
         AND kr.goal_id = ?
         ${clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : ''}
       ORDER BY gr.recorded_at ${orderDir}, gr.id ${orderDir}${limitClause}`,
      options?.limit
        ? [identityId, goalId, ...params, options.limit]
        : [identityId, goalId, ...params],
    );

    return rows.map((row) => PowerSyncGoalRecordMapper.toDomain(row));
  }

  async findByKeyResultIds(
    identityId: string,
    keyResultIds: string[],
    options?: GoalRecordQueryOptions,
  ): Promise<Map<string, GoalRecord[]>> {
    const result = new Map<string, GoalRecord[]>();
    for (const keyResultId of keyResultIds) {
      result.set(keyResultId, []);
    }

    if (keyResultIds.length === 0) {
      return result;
    }

    const placeholders = keyResultIds.map(() => '?').join(', ');
    const { clauses, params } = buildTimeFilters(options);
    const orderDir = options?.orderBy === 'desc' ? 'DESC' : 'ASC';
    const limitClause = options?.limit ? ' LIMIT ?' : '';

    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT *
       FROM goal_records
       WHERE identity_id = ?
         AND key_result_id IN (${placeholders})
         ${clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : ''}
       ORDER BY recorded_at ${orderDir}, id ${orderDir}${limitClause}`,
      options?.limit
        ? [identityId, ...keyResultIds, ...params, options.limit]
        : [identityId, ...keyResultIds, ...params],
    );

    for (const row of rows) {
      const record = PowerSyncGoalRecordMapper.toDomain(row);
      const list = result.get(String(row.key_result_id)) ?? [];
      list.push(record);
      result.set(String(row.key_result_id), list);
    }

    return result;
  }

  async countByKeyResultId(identityId: string, keyResultId: string): Promise<number> {
    const row = await this.db.getOptional<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM goal_records
       WHERE identity_id = ?
         AND key_result_id = ?`,
      [identityId, keyResultId],
    );

    return Number(row?.count ?? 0);
  }

  async findBySource(
    identityId: string,
    sourceType: GoalRecordSourceTypeValue,
    sourceId: string,
  ): Promise<GoalRecord | null> {
    const row = await this.db.getOptional<Record<string, unknown>>(
      `SELECT * FROM goal_records
       WHERE identity_id = ? AND source_type = ? AND source_id = ?
       LIMIT 1`,
      [identityId, sourceType, sourceId],
    );
    return row ? PowerSyncGoalRecordMapper.toDomain(row) : null;
  }

  async save(record: GoalRecord): Promise<void> {
    const dto = record.toServerDTO();

    const existing = await this.db.getOptional<{ id: string }>(
      `SELECT id FROM goal_records WHERE id = ? LIMIT 1`,
      [dto.id],
    );

    if (existing) {
      await this.db.execute(
        `UPDATE goal_records
         SET key_result_id = ?,
             identity_id = ?,
             value = ?,
             note = ?,
             authorship = ?,
             source_type = ?,
             source_id = ?,
             recorded_at = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          dto.keyResultId,
          dto.identityId,
          dto.value,
          dto.note,
          dto.authorship,
          dto.sourceType,
          dto.sourceId,
          toDbDateTime(dto.recordedAt),
          toDbDateTime(dto.updatedAt),
          dto.id,
        ],
      );
    } else {
      await this.db.execute(
        `INSERT INTO goal_records (
           id, key_result_id, identity_id, value, note, authorship, source_type, source_id, recorded_at,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dto.id,
          dto.keyResultId,
          dto.identityId,
          dto.value,
          dto.note,
          dto.authorship,
          dto.sourceType,
          dto.sourceId,
          toDbDateTime(dto.recordedAt),
          toDbDateTime(dto.createdAt),
          toDbDateTime(dto.updatedAt),
        ],
      );
    }
  }

  async findByIdForIdentity(identityId: string, recordId: string): Promise<GoalRecord | null> {
    const row = await this.db.getOptional<Record<string, unknown>>(
      `SELECT * FROM goal_records WHERE id = ? AND identity_id = ? LIMIT 1`,
      [recordId, identityId],
    );
    return row ? PowerSyncGoalRecordMapper.toDomain(row) : null;
  }

  async delete(identityId: string, recordId: string): Promise<void> {
    const existing = await this.findByIdForIdentity(identityId, recordId);
    if (!existing) {
      throw new Error('Goal record not found for the current identity.');
    }
    await this.db.execute(`DELETE FROM goal_records WHERE id = ? AND identity_id = ?`, [
      recordId,
      identityId,
    ]);
  }

  async deleteMany(identityId: string, recordIds: string[]): Promise<void> {
    if (recordIds.length === 0) return;
    const placeholders = recordIds.map(() => '?').join(', ');
    await this.db.execute(
      `DELETE FROM goal_records WHERE identity_id = ? AND id IN (${placeholders})`,
      [identityId, ...recordIds],
    );
  }

  // Mapping lives in mappers/powersync-goal-record.mapper.ts
}
