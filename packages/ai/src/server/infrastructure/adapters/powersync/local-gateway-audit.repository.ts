import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import {
  LocalGatewayAuditRecordSchema,
  type LocalGatewayAuditRecord,
} from '@memoflow/ai-contracts';

const rowSchema = z.object({ record_json: z.string() });

function decode(row: unknown): LocalGatewayAuditRecord {
  return LocalGatewayAuditRecordSchema.parse(JSON.parse(rowSchema.parse(row).record_json));
}

/**
 * Profile-local sink for local MCP tool calls.
 *
 * Rows are append-only and owner-scoped; the record carries the cloud audit
 * shape plus the local connection/origin context. Tool arguments and results
 * are never persisted — `outcome` is a bounded status, not a payload.
 */
export class LocalGatewayAuditRepository {
  constructor(private readonly db: IElectronDatabase) {}

  async record(owner: string, event: Omit<LocalGatewayAuditRecord, 'id'>): Promise<void> {
    const record = LocalGatewayAuditRecordSchema.parse({ ...event, id: randomUUID() });
    await this.db.execute(
      'INSERT INTO ai_local_gateway_audit (id, identity_id, at, record_json) VALUES (?, ?, ?, ?)',
      [record.id, owner, record.at, JSON.stringify(record)],
    );
  }

  async list(owner: string, limit = 20): Promise<LocalGatewayAuditRecord[]> {
    const bounded = Math.min(100, Math.max(1, Math.trunc(limit)));
    const rows = await this.db.getAll<unknown>(
      'SELECT record_json FROM ai_local_gateway_audit WHERE identity_id = ? ORDER BY at DESC, id DESC LIMIT ?',
      [owner, bounded],
    );
    return rows.map(decode);
  }
}
