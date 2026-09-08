import {
  TaskLabelOwnershipError,
  type ITaskTemplateRepository,
  type TaskFilters,
} from '../../../domain/repositories/i-task-template-repository';
import { TaskTemplate } from '../../../domain/aggregates/task-template';
import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { TaskTemplateStatus } from '@memoflow/contracts/task';
import type { LabelClientDTO } from '@memoflow/contracts/label';
import { AggregateRepositoryBase, createEventBusAdapter, type IEventBus } from '@memoflow/patterns';
import { eventBus } from '@memoflow/utils/domain';
import {
  PowerSyncTaskTemplateMapper,
  type PowerSyncTaskTemplateRow,
} from './mappers/powersync-task-template.mapper';
import {
  PowerSyncTaskInstanceMapper,
  type PowerSyncTaskInstanceRow,
} from './mappers/powersync-task-instance.mapper';

const eventBusAdapter = createEventBusAdapter(eventBus);

export class PowerSyncTaskTemplateRepository
  extends AggregateRepositoryBase<TaskTemplate>
  implements ITaskTemplateRepository
{
  constructor(
    private readonly db: IElectronDatabaseTransaction,
    eventBus: IEventBus = eventBusAdapter,
  ) {
    super(eventBus);
  }

  private static labelDto(row: Record<string, unknown>): LabelClientDTO {
    return {
      id: String(row.id),
      name: String(row.name),
      color: row.color == null ? null : String(row.color),
      createdAt: Date.parse(String(row.created_at)),
      updatedAt: Date.parse(String(row.updated_at)),
    };
  }

  private async loadLabelMap(
    identityId: string,
    taskTemplateIds: readonly string[],
  ): Promise<Map<string, LabelClientDTO[]>> {
    const ids = [...new Set(taskTemplateIds)];
    const result = new Map(ids.map((id) => [id, [] as LabelClientDTO[]]));
    if (ids.length === 0) return result;

    const placeholders = ids.map(() => '?').join(', ');
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT l.*, tl.task_template_id AS owner_id
       FROM labels l
       INNER JOIN task_labels tl ON tl.label_id = l.id AND tl.identity_id = l.identity_id
       WHERE tl.identity_id = ? AND tl.task_template_id IN (${placeholders})
       ORDER BY tl.task_template_id ASC, l.name ASC, l.id ASC`,
      [identityId, ...ids],
    );
    for (const row of rows) {
      result.get(String(row.owner_id))?.push(PowerSyncTaskTemplateRepository.labelDto(row));
    }
    return result;
  }

  private async hydrateTemplates(
    identityId: string,
    templates: TaskTemplate[],
  ): Promise<TaskTemplate[]> {
    const labelMap = await this.loadLabelMap(
      identityId,
      templates.map((template) => String(template.id)),
    );
    for (const template of templates) {
      template.hydrateLabels(labelMap.get(String(template.id)) ?? []);
    }
    return templates;
  }

  private async hydrateTemplate(
    identityId: string,
    template: TaskTemplate | null,
  ): Promise<TaskTemplate | null> {
    if (!template) return null;
    await this.hydrateTemplates(identityId, [template]);
    return template;
  }

  protected async persist(template: TaskTemplate): Promise<void> {
    const data = PowerSyncTaskTemplateMapper.toPersistence(template);
    const existing = await this.db.getOptional<{ id: string }>(
      'SELECT id FROM task_templates WHERE id = ? LIMIT 1',
      [data.id],
    );
    const mutableColumns: readonly (readonly [string, unknown])[] = [
      ['identity_id', data.identityId],
      ['name', data.name],
      ['description', data.description],
      ['status', data.status],
      ['outcome', data.outcome],
      ['completion_policy', data.completionPolicy],
      ['closed_at', data.closedAt],
      ['archived_at', data.archivedAt],
      ['abandoned_reason', data.abandonedReason],
      ['importance', data.importance],
      ['time_config_type', data.timeConfigType],
      ['time_config_start_time', data.timeConfigStartTime],
      ['time_config_end_time', data.timeConfigEndTime],
      ['time_config_duration_minutes', data.timeConfigDurationMinutes],
      ['time_config_time_point', data.timeConfigTimePoint],
      ['time_config_time_range_start', data.timeConfigTimeRangeStart],
      ['time_config_time_range_end', data.timeConfigTimeRangeEnd],
      ['recurrence_rule_type', data.recurrenceRuleType],
      ['recurrence_rule_interval', data.recurrenceRuleInterval],
      ['recurrence_rule_days_of_week', data.recurrenceRuleDaysOfWeek],
      ['recurrence_rule_end_date', data.recurrenceRuleEndDate],
      ['recurrence_rule_count', data.recurrenceRuleCount],
      ['reminder_config_enabled', data.reminderConfigEnabled],
      ['reminder_config_time_offset_minutes', data.reminderConfigTimeOffsetMinutes],
      ['reminder_config_unit', data.reminderConfigUnit],
      ['reminder_config_channel', data.reminderConfigChannel],
      ['last_generated_date', data.lastGeneratedDate],
      ['generate_ahead_days', data.generateAheadDays],
      ['goal_id', data.goalId],
      ['key_result_id', data.keyResultId],
      ['goal_record_value', data.goalRecordValue],
      ['goal_progress_trigger', data.goalProgressTrigger],
      ['checklist', data.checklist],
      ['version', data.version],
      ['updated_at', data.updatedAt],
      ['deleted_at', data.deletedAt],
    ];

    if (existing) {
      await this.db.execute(
        `UPDATE task_templates SET ${mutableColumns.map(([column]) => `${column} = ?`).join(', ')} WHERE id = ?`,
        [...mutableColumns.map(([, value]) => value), data.id],
      );
      return;
    }

    const insertColumns: readonly (readonly [string, unknown])[] = [
      ['id', data.id],
      ...mutableColumns,
      ['created_at', data.createdAt],
    ];
    await this.db.execute(
      `INSERT INTO task_templates (${insertColumns.map(([column]) => column).join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
      insertColumns.map(([, value]) => value),
    );
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<TaskTemplate | null> {
    const row = await this.db.getOptional<PowerSyncTaskTemplateRow>(
      'SELECT * FROM task_templates WHERE id = ? AND identity_id = ? LIMIT 1',
      [id, identityId],
    );
    return this.hydrateTemplate(identityId, row ? PowerSyncTaskTemplateMapper.toDomain(row) : null);
  }

  async findByIdWithChildren(identityId: string, id: string): Promise<TaskTemplate | null> {
    const template = await this.findByIdForIdentity(identityId, id);
    if (!template) return null;

    const instances = await this.db.getAll<PowerSyncTaskInstanceRow>(
      'SELECT * FROM task_instances WHERE template_id = ? AND identity_id = ? ORDER BY instance_date DESC',
      [id, identityId],
    );
    instances
      .map((row) => PowerSyncTaskInstanceMapper.toDomain(row))
      .forEach((instance) => template.addInstance(instance));
    return template;
  }

  async findByIdentityId(identityId: string): Promise<TaskTemplate[]> {
    return this.queryTemplates(
      identityId,
      'SELECT * FROM task_templates WHERE identity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      [identityId],
    );
  }

  async findByStatus(identityId: string, status: TaskTemplateStatus): Promise<TaskTemplate[]> {
    return this.queryTemplates(
      identityId,
      'SELECT * FROM task_templates WHERE identity_id = ? AND status = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      [identityId, status],
    );
  }

  async findActiveTemplates(identityId: string): Promise<TaskTemplate[]> {
    return this.findByStatus(identityId, 'Active' as TaskTemplateStatus);
  }

  async findByGoalId(identityId: string, goalId: string): Promise<TaskTemplate[]> {
    return this.queryTemplates(
      identityId,
      'SELECT * FROM task_templates WHERE identity_id = ? AND goal_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      [identityId, goalId],
    );
  }

  async findByLabelIdsAll(
    identityId: string,
    labelIds: readonly string[],
  ): Promise<TaskTemplate[]> {
    const requiredLabelIds = [...new Set(labelIds)];
    if (requiredLabelIds.length === 0) return this.findByIdentityId(identityId);

    const placeholders = requiredLabelIds.map(() => '?').join(', ');
    const matches = await this.db.getAll<{ task_template_id: string }>(
      `SELECT task_template_id FROM task_labels
       WHERE identity_id = ? AND label_id IN (${placeholders})
       GROUP BY task_template_id
       HAVING COUNT(DISTINCT label_id) = ?`,
      [identityId, ...requiredLabelIds, requiredLabelIds.length],
    );
    if (matches.length === 0) return [];

    const templatePlaceholders = matches.map(() => '?').join(', ');
    return this.queryTemplates(
      identityId,
      `SELECT * FROM task_templates
       WHERE identity_id = ? AND id IN (${templatePlaceholders}) AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [identityId, ...matches.map((row) => row.task_template_id)],
    );
  }

  async replaceLabels(
    identityId: string,
    taskTemplateId: string,
    labelIds: readonly string[],
  ): Promise<LabelClientDTO[]> {
    const owner = await this.db.getOptional<{ id: string }>(
      'SELECT id FROM task_templates WHERE id = ? AND identity_id = ? LIMIT 1',
      [taskTemplateId, identityId],
    );
    if (!owner) throw new Error('Task template not found.');

    const uniqueIds = [...new Set(labelIds)];
    for (const labelId of uniqueIds) {
      const label = await this.db.getOptional<{ id: string }>(
        'SELECT id FROM labels WHERE id = ? AND identity_id = ? LIMIT 1',
        [labelId, identityId],
      );
      if (!label) throw new TaskLabelOwnershipError();
    }

    await this.db.execute(
      'DELETE FROM task_labels WHERE identity_id = ? AND task_template_id = ?',
      [identityId, taskTemplateId],
    );
    for (const labelId of uniqueIds) {
      await this.db.execute(
        'INSERT INTO task_labels (id, identity_id, task_template_id, label_id) VALUES (?, ?, ?, ?)',
        [`${identityId}:${taskTemplateId}:${labelId}`, identityId, taskTemplateId, labelId],
      );
    }
    return (await this.loadLabelMap(identityId, [taskTemplateId])).get(taskTemplateId) ?? [];
  }

  async findAllTemplateRefs(): Promise<Array<{ id: string; identityId: string }>> {
    // PowerSync only contains rows synchronized for the local profile. Enumerate
    // every local row (including soft-deleted/archived templates) so startup
    // repair can both recreate missed intents and remove stale Scheduler owners.
    const rows = await this.db.getAll<{ id: string; identity_id: string }>(
      'SELECT id, identity_id FROM task_templates ORDER BY id ASC',
      [],
    );
    return rows.map((row) => ({ id: String(row.id), identityId: String(row.identity_id) }));
  }

  async findNeedGenerateInstances(toDate: number): Promise<TaskTemplate[]> {
    const rawRows = await this.db.getAll<PowerSyncTaskTemplateRow>(
      `SELECT * FROM task_templates
       WHERE recurrence_rule_type IS NOT NULL AND status = 'Active' AND deleted_at IS NULL
       ORDER BY updated_at ASC`,
      [],
    );
    const rows = rawRows.map((row) => PowerSyncTaskTemplateMapper.toDomain(row));
    return rows.filter((template) => {
      const lastGeneratedDate = template.toServerDTO().lastGeneratedDate;
      return lastGeneratedDate == null || lastGeneratedDate < toDate;
    });
  }

  async delete(identityId: string, id: string): Promise<void> {
    const existing = await this.findByIdForIdentity(identityId, id);
    if (!existing) {
      throw new Error('Task template not found for the current identity.');
    }
    await this.db.execute('DELETE FROM task_templates WHERE id = ? AND identity_id = ?', [
      id,
      identityId,
    ]);
  }

  async softDelete(identityId: string, id: string): Promise<void> {
    const existing = await this.findByIdForIdentity(identityId, id);
    if (!existing) {
      throw new Error('Task template not found for the current identity.');
    }
    const now = new Date().toISOString();
    await this.db.execute(
      'UPDATE task_templates SET deleted_at = ?, updated_at = ? WHERE id = ? AND identity_id = ?',
      [now, now, id, identityId],
    );
  }

  async restore(identityId: string, id: string): Promise<void> {
    const existing = await this.findByIdForIdentity(identityId, id);
    if (!existing) {
      throw new Error('Task template not found for the current identity.');
    }
    await this.db.execute(
      'UPDATE task_templates SET deleted_at = NULL, archived_at = NULL, updated_at = ? WHERE id = ? AND identity_id = ?',
      [new Date().toISOString(), id, identityId],
    );
  }

  async findOneTimeTasks(identityId: string, filters?: TaskFilters): Promise<TaskTemplate[]> {
    return this.queryByType(identityId, true, filters);
  }

  async findRecurringTasks(identityId: string, filters?: TaskFilters): Promise<TaskTemplate[]> {
    return this.queryByType(identityId, false, filters);
  }

  async findOverdueTasks(identityId: string): Promise<TaskTemplate[]> {
    const rows = await this.findOneTimeTasks(identityId, { status: 'Active' });
    return rows.filter((template) => template.isOverdue());
  }

  async findByKeyResultId(identityId: string, keyResultId: string): Promise<TaskTemplate[]> {
    return this.queryTemplates(
      identityId,
      'SELECT * FROM task_templates WHERE identity_id = ? AND key_result_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      [identityId, keyResultId],
    );
  }

  async findUpcomingTasks(identityId: string, daysAhead: number): Promise<TaskTemplate[]> {
    const rows = await this.findOneTimeTasks(identityId, { status: 'Active' });
    const now = Date.now();
    const end = now + daysAhead * 86400000;
    return rows.filter((template) => {
      const startDate = template.toServerDTO().timeConfig?.startDate;
      return startDate != null && startDate >= now && startDate <= end;
    });
  }

  async findTodayTasks(identityId: string): Promise<TaskTemplate[]> {
    return this.findUpcomingTasks(identityId, 1);
  }

  async countTasks(identityId: string, filters?: TaskFilters): Promise<number> {
    const where = this.buildFilters(
      ['identity_id = ?', 'deleted_at IS NULL'],
      [identityId],
      filters,
    );
    const result = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM task_templates WHERE ${where.clauses.join(' AND ')}`,
      where.params,
    );
    return Number(result.count ?? 0);
  }

  async saveBatch(templates: TaskTemplate[]): Promise<void> {
    for (const template of templates) {
      await this.save(template);
    }
  }

  async deleteBatch(identityId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    await this.db.execute(
      `DELETE FROM task_templates WHERE identity_id = ? AND id IN (${placeholders})`,
      [identityId, ...ids],
    );
  }

  private async queryByType(
    identityId: string,
    oneTime: boolean,
    filters?: TaskFilters,
  ): Promise<TaskTemplate[]> {
    const clauses = ['identity_id = ?', 'deleted_at IS NULL'];
    const params: unknown[] = [identityId];
    clauses.push(oneTime ? 'recurrence_rule_type IS NULL' : 'recurrence_rule_type IS NOT NULL');
    const where = this.buildFilters(clauses, params, filters);
    let sql = `SELECT * FROM task_templates WHERE ${where.clauses.join(' AND ')} ORDER BY created_at DESC`;
    if (filters?.limit) {
      sql += ' LIMIT ?';
      where.params.push(filters.limit);
    }
    if (filters?.offset) {
      sql += ' OFFSET ?';
      where.params.push(filters.offset);
    }
    return this.queryTemplates(identityId, sql, where.params);
  }

  private buildFilters(baseClauses: string[], baseParams: unknown[], filters?: TaskFilters) {
    const clauses = [...baseClauses];
    const params = [...baseParams];
    if (filters?.status) {
      clauses.push('status = ?');
      params.push(filters.status);
    }
    return { clauses, params };
  }

  private async queryTemplates(
    identityId: string,
    sql: string,
    params: unknown[],
  ): Promise<TaskTemplate[]> {
    const rows = await this.db.getAll<PowerSyncTaskTemplateRow>(sql, params);
    return this.hydrateTemplates(
      identityId,
      rows.map((row) => PowerSyncTaskTemplateMapper.toDomain(row)),
    );
  }
}
