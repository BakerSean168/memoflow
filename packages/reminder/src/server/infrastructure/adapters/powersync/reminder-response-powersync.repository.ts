import type { ReminderResponseAction } from '@memoflow/contracts/reminder';
import type { IReminderResponseRepository } from '../../../domain/repositories/i-reminder-response-repository';
import { ReminderResponse } from '../../../domain/entities/reminder-response';
import {
  PowerSyncReminderResponseMapper,
  type PowerSyncReminderResponseRow,
} from './mappers/powersync-reminder-response.mapper';

type Queryable = {
  getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]>;
  getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null>;
  execute(sql: string, parameters?: unknown[]): Promise<unknown>;
};

export class ReminderResponsePowerSyncRepository implements IReminderResponseRepository {
  constructor(private readonly db: Queryable) {}

  async save(response: ReminderResponse): Promise<void> {
    const dto = response.toServerDTO();
    const ts = new Date(dto.timestamp).toISOString();
    const existing = await this.db.getOptional<{ id: string }>(
      'SELECT id FROM reminder_responses WHERE id = ? LIMIT 1',
      [dto.id],
    );

    if (existing) {
      await this.db.execute(
        `UPDATE reminder_responses
         SET action = ?,
             response_time = ?,
             snooze_duration_seconds = ?,
             timestamp = ?
         WHERE id = ?`,
        [dto.action, dto.responseTime ?? null, dto.snoozeDurationSeconds ?? null, ts, dto.id],
      );
    } else {
      await this.db.execute(
        `INSERT INTO reminder_responses (
          id, identity_id, template_id, action, response_time, snooze_duration_seconds, timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dto.id,
          dto.identityId,
          dto.reminderTemplateId,
          dto.action,
          dto.responseTime ?? null,
          dto.snoozeDurationSeconds ?? null,
          ts,
          ts,
        ],
      );
    }
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<ReminderResponse | null> {
    const row = await this.db.getOptional<PowerSyncReminderResponseRow>(
      'SELECT * FROM reminder_responses WHERE id = ? AND identity_id = ? LIMIT 1',
      [id, identityId],
    );
    return row ? PowerSyncReminderResponseMapper.toDomain(row) : null;
  }

  async findByTemplateId(
    templateId: string,
    identityId: string,
    limit?: number,
  ): Promise<ReminderResponse[]> {
    const rows = await this.db.getAll<PowerSyncReminderResponseRow>(
      `SELECT * FROM reminder_responses WHERE template_id = ? AND identity_id = ? ORDER BY timestamp DESC${limit ? ' LIMIT ?' : ''}`,
      limit ? [templateId, identityId, limit] : [templateId, identityId],
    );
    return rows.map((row) => PowerSyncReminderResponseMapper.toDomain(row));
  }

  async getResponseStats(templateId: string, identityId: string, lookbackDays: number = 30) {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const rows = await this.db.getAll<PowerSyncReminderResponseRow>(
      'SELECT * FROM reminder_responses WHERE template_id = ? AND identity_id = ? AND timestamp >= ?',
      [templateId, identityId, cutoff],
    );
    const total = rows.length;
    const counters = { CLICKED: 0, IGNORED: 0, SNOOZED: 0, DISMISSED: 0, COMPLETED: 0 } as Record<
      string,
      number
    >;
    let responseTimeTotal = 0;
    let responseTimeCount = 0;
    for (const row of rows) {
      counters[row.action] = (counters[row.action] ?? 0) + 1;
      if (row.response_time != null) {
        responseTimeTotal += row.response_time;
        responseTimeCount += 1;
      }
    }
    return {
      total,
      clicked: counters.CLICKED ?? 0,
      ignored: counters.IGNORED ?? 0,
      snoozed: counters.SNOOZED ?? 0,
      dismissed: counters.DISMISSED ?? 0,
      completed: counters.COMPLETED ?? 0,
      avgResponseTime:
        responseTimeCount > 0 ? Math.round(responseTimeTotal / responseTimeCount) : 0,
    };
  }

  async deleteByTemplateId(templateId: string, identityId: string): Promise<number> {
    const rows = await this.db.getAll<{ id: string }>(
      'SELECT id FROM reminder_responses WHERE template_id = ? AND identity_id = ?',
      [templateId, identityId],
    );
    await this.db.execute(
      'DELETE FROM reminder_responses WHERE template_id = ? AND identity_id = ?',
      [templateId, identityId],
    );
    return rows.length;
  }

  async getResponseDistribution(
    templateId: string,
    identityId: string,
    lookbackDays: number = 30,
  ): Promise<Record<ReminderResponseAction, number>> {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const rows = await this.db.getAll<PowerSyncReminderResponseRow>(
      'SELECT * FROM reminder_responses WHERE template_id = ? AND identity_id = ? AND timestamp >= ?',
      [templateId, identityId, cutoff],
    );
    const distribution = {
      CLICKED: 0,
      IGNORED: 0,
      SNOOZED: 0,
      DISMISSED: 0,
      COMPLETED: 0,
    } as Record<ReminderResponseAction, number>;
    for (const row of rows) {
      distribution[row.action as ReminderResponseAction] += 1;
    }
    return distribution;
  }
}
