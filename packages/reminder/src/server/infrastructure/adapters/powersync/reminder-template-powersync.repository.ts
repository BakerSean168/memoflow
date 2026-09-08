import type { IReminderTemplateRepository } from '../../../domain/repositories/i-reminder-template-repository';
import type { ReminderStatus, ReminderEventMap } from '@memoflow/contracts/reminder';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { ReminderTemplate } from '../../../domain/aggregates/reminder-template';
import { createTypedEventPublisher, eventBus, flushDomainEvents } from '@memoflow/utils/domain';
import { createLogger } from '@memoflow/utils/logger';
import {
  PowerSyncReminderTemplateMapper,
  type PowerSyncReminderTemplateRow,
  type PowerSyncReminderHistoryRow,
} from './mappers/powersync-reminder-template.mapper';

const logger = createLogger('ReminderTemplatePowerSyncRepo');
const reminderEventPublisher = createTypedEventPublisher<ReminderEventMap>(eventBus);

export class ReminderTemplatePowerSyncRepository implements IReminderTemplateRepository {
  constructor(private readonly db: IElectronDatabase) {}

  async save(template: ReminderTemplate): Promise<void> {
    const pendingDomainEvents = template.domainEvents.map((event) => event.eventType);

    logger.info('[Reminder][Repo] Saving template', {
      templateId: String(template.id),
      identityId: String(template.identityId),
      title: template.title,
      status: template.status,
      selfEnabled: template.selfEnabled,
      effectiveEnabled: template.isEffectivelyEnabled(),
      nextTriggerAt: template.nextTriggerAt,
      historyCount: template.getAllHistory().length,
      pendingDomainEvents,
    });

    // 模板与其历史记录多条写入放进单事务，避免半持久化。
    await this.db.writeTransaction(async (tx: IElectronDatabaseTransaction) => {
      await this.saveWithinTransaction(tx, template);
    });

    await this.publishPersistedEvents(template, pendingDomainEvents);
  }

  /**
   * Transaction-scoped aggregate persistence used by Reminder-owned durable
   * side-effect commits (NOTIF-3302). Event publication remains post-commit.
   */
  async saveWithinTransaction(
    tx: IElectronDatabaseTransaction,
    template: ReminderTemplate,
  ): Promise<void> {
    const data = PowerSyncReminderTemplateMapper.toPersistence(template);
    const existingTemplate = await tx.getOptional<{ id: string }>(
      'SELECT id FROM reminder_templates WHERE id = ? LIMIT 1',
      [data.id],
    );

    if (existingTemplate) {
      await tx.execute(
        `UPDATE reminder_templates
         SET name = ?,
             description = ?,
             type = ?,
             self_enabled = ?,
             status = ?,
             importance_level = ?,
             tags = ?,
             color = ?,
             icon = ?,
             next_trigger_at = ?,
             version = ?,
             updated_at = ?,
             deleted_at = ?,
             trigger = ?,
             active_time = ?,
             active_hours = ?,
             notification_config = ?,
             stats = ?
         WHERE id = ?`,
        [
          data.name,
          data.description,
          data.type,
          data.selfEnabled,
          data.status,
          data.importanceLevel,
          data.tags,
          data.color,
          data.icon,
          data.nextTriggerAt,
          data.version,
          data.updatedAt,
          data.deletedAt,
          data.trigger,
          data.activeTime,
          data.activeHours,
          data.notificationConfig,
          data.stats,
          data.id,
        ],
      );
    } else {
      await tx.execute(
        `INSERT INTO reminder_templates (
          id, identity_id, name, description, type, self_enabled, status,
          importance_level, tags, color, icon, next_trigger_at, version, created_at, updated_at,
          deleted_at, trigger, active_time, active_hours, notification_config, stats
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.id,
          data.identityId,
          data.name,
          data.description,
          data.type,
          data.selfEnabled,
          data.status,
          data.importanceLevel,
          data.tags,
          data.color,
          data.icon,
          data.nextTriggerAt,
          data.version,
          data.createdAt,
          data.updatedAt,
          data.deletedAt,
          data.trigger,
          data.activeTime,
          data.activeHours,
          data.notificationConfig,
          data.stats,
        ],
      );
    }

    for (const history of template.getAllHistory()) {
      const dto = history.toServerDTO();
      const existingHistory = await tx.getOptional<{ id: string }>(
        'SELECT id FROM reminder_history WHERE id = ? LIMIT 1',
        [dto.id],
      );

      if (existingHistory) {
        await tx.execute(
          `UPDATE reminder_history
           SET result = ?,
               error = ?,
               notification_sent = ?,
               notification_channel = ?
           WHERE id = ?`,
          [
            dto.result,
            dto.error ?? null,
            dto.notificationSent ? 1 : 0,
            dto.notificationChannels ? JSON.stringify(dto.notificationChannels) : null,
            dto.id,
          ],
        );
      } else {
        await tx.execute(
          `INSERT INTO reminder_history (
            id, identity_id, template_id, triggered_at, result, error, notification_sent, notification_channel, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dto.id,
            dto.identityId,
            dto.templateId,
            new Date(dto.triggeredAt).toISOString(),
            dto.result,
            dto.error ?? null,
            dto.notificationSent ? 1 : 0,
            dto.notificationChannels ? JSON.stringify(dto.notificationChannels) : null,
            new Date(dto.createdAt).toISOString(),
          ],
        );
      }
    }
  }

  /** Publish aggregate events only after an externally-owned transaction commits. */
  async publishPersistedEvents(
    template: ReminderTemplate,
    pendingDomainEvents = template.domainEvents.map((event) => event.eventType),
  ): Promise<void> {
    if (pendingDomainEvents.length > 0) {
      flushDomainEvents(reminderEventPublisher, template);
      logger.info('[Reminder][Repo] Published domain events after PowerSync save', {
        templateId: String(template.id),
        publishedDomainEvents: pendingDomainEvents,
      });
      return;
    }
    logger.warn('[Reminder][Repo] PowerSync save completed without domain events to publish', {
      templateId: String(template.id),
    });
  }

  async findByIdForIdentity(
    identityId: string,
    id: string,
    options?: { includeHistory?: boolean; historyLimit?: number },
  ): Promise<ReminderTemplate | null> {
    const row = await this.db.getOptional<PowerSyncReminderTemplateRow>(
      'SELECT * FROM reminder_templates WHERE id = ? AND identity_id = ? LIMIT 1',
      [id, identityId],
    );
    if (!row) return null;
    const history = options?.includeHistory
      ? await this.loadHistory(row.id, options.historyLimit)
      : [];
    return PowerSyncReminderTemplateMapper.toDomain(row, history);
  }

  async findByIdentityId(
    identityId: string,
    options?: { includeHistory?: boolean; historyLimit?: number; includeDeleted?: boolean },
  ): Promise<ReminderTemplate[]> {
    const sql = `SELECT * FROM reminder_templates WHERE identity_id = ?${
      options?.includeDeleted ? '' : ' AND deleted_at IS NULL'
    } ORDER BY created_at ASC`;
    return this.mapRows(
      await this.db.getAll(sql, [identityId]),
      options?.includeHistory,
      options?.historyLimit,
    );
  }

  async findAllTemplateRefs(): Promise<Array<{ id: string; identityId: string }>> {
    const rows = await this.db.getAll<{ id: string; identity_id: string }>(
      'SELECT id, identity_id FROM reminder_templates WHERE deleted_at IS NULL ORDER BY created_at ASC',
    );
    return rows.map((row) => ({ id: row.id, identityId: row.identity_id }));
  }

  async findActive(
    identityId: string,
    options?: { includeHistory?: boolean; historyLimit?: number },
  ): Promise<ReminderTemplate[]> {
    const sql = `SELECT * FROM reminder_templates WHERE identity_id = ? AND self_enabled = 1 AND status = 'Active' AND deleted_at IS NULL ORDER BY created_at ASC`;
    return this.mapRows(
      await this.db.getAll(sql, [identityId]),
      options?.includeHistory,
      options?.historyLimit,
    );
  }

  async findByNextTriggerBefore(
    beforeTime: number,
    identityId?: string,
  ): Promise<ReminderTemplate[]> {
    const sql = `SELECT * FROM reminder_templates WHERE self_enabled = 1 AND status = 'Active' AND deleted_at IS NULL AND next_trigger_at <= ?${
      identityId ? ' AND identity_id = ?' : ''
    } ORDER BY next_trigger_at ASC`;
    const params = identityId
      ? [new Date(beforeTime).toISOString(), identityId]
      : [new Date(beforeTime).toISOString()];
    return this.mapRows(await this.db.getAll(sql, params), false);
  }

  async findByIds(
    identityId: string,
    ids: string[],
    options?: { includeHistory?: boolean; historyLimit?: number },
  ): Promise<ReminderTemplate[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = await this.db.getAll<PowerSyncReminderTemplateRow>(
      `SELECT * FROM reminder_templates WHERE identity_id = ? AND id IN (${placeholders})`,
      [identityId, ...ids],
    );
    const templates = await this.mapRows(rows, options?.includeHistory, options?.historyLimit);
    const map = new Map(templates.map((template) => [String(template.id), template]));
    return ids.map((id) => map.get(id)).filter((item): item is ReminderTemplate => !!item);
  }

  async delete(identityId: string, id: string): Promise<void> {
    const existing = await this.findByIdForIdentity(identityId, id);
    if (!existing) {
      throw new Error('Reminder template not found for the current identity.');
    }
    await this.db.execute('DELETE FROM reminder_templates WHERE id = ? AND identity_id = ?', [
      id,
      identityId,
    ]);
  }

  async exists(identityId: string, id: string): Promise<boolean> {
    return (await this.findByIdForIdentity(identityId, id)) !== null;
  }

  async count(
    identityId: string,
    options?: { status?: ReminderStatus; includeDeleted?: boolean },
  ): Promise<number> {
    const clauses = ['identity_id = ?'];
    const params: unknown[] = [identityId];
    if (options?.status) {
      clauses.push('status = ?');
      params.push(options.status);
    }
    if (!options?.includeDeleted) {
      clauses.push('deleted_at IS NULL');
    }
    const result = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM reminder_templates WHERE ${clauses.join(' AND ')}`,
      params,
    );
    return Number(result.count ?? 0);
  }

  private async mapRows(
    rows: PowerSyncReminderTemplateRow[],
    includeHistory?: boolean,
    historyLimit?: number,
  ): Promise<ReminderTemplate[]> {
    return Promise.all(
      rows.map(async (row) =>
        PowerSyncReminderTemplateMapper.toDomain(
          row,
          includeHistory ? await this.loadHistory(row.id, historyLimit) : [],
        ),
      ),
    );
  }

  private async loadHistory(
    templateId: string,
    limit?: number,
  ): Promise<PowerSyncReminderHistoryRow[]> {
    return this.db.getAll<PowerSyncReminderHistoryRow>(
      `SELECT * FROM reminder_history WHERE template_id = ? ORDER BY triggered_at DESC${
        limit ? ' LIMIT ?' : ''
      }`,
      limit ? [templateId, limit] : [templateId],
    );
  }
}
