import { withPermissionStorage } from '../infrastructure/adapters/permission-storage-error';
import { createHash, randomUUID } from 'node:crypto';
import {
  PermissionAuditRecordSchema,
  PermissionRuleSchema,
  PermissionSettingsSchema,
  type PermissionAuditRecord,
  type PermissionRule,
  type PermissionSettings,
} from '@memoflow/ai-contracts';
import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import type { PermissionRepository } from './permission.repository';

function stableId(owner: string, suffix: string): string {
  const ownerKey = createHash('sha256').update(owner).digest('hex');
  return `${ownerKey}:${suffix}`;
}

export class PermissionPowerSyncRepository implements PermissionRepository {
  constructor(
    protected readonly db: IElectronDatabase,
    private readonly localOnly = false,
  ) {}

  private get settingsTable() {
    return this.localOnly ? 'ai_permission_settings_local' : 'ai_permission_settings';
  }
  private get rulesTable() {
    return this.localOnly ? 'ai_permission_rules_local' : 'ai_permission_rules';
  }
  private get auditTable() {
    return this.localOnly ? 'ai_permission_audit_local' : 'ai_permission_audit';
  }
  private ready?: Promise<void>;
  private ensureLocalTables(): Promise<void> {
    if (!this.localOnly) return Promise.resolve();
    this.ready ??= Promise.resolve()
      .then(() =>
        this.db.execute(`CREATE TABLE IF NOT EXISTS ai_permission_settings_local (
        id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, revision INTEGER NOT NULL,
        record_json TEXT NOT NULL, updated_at TEXT NOT NULL
      )`),
      )
      .then(() =>
        this.db.execute(`CREATE TABLE IF NOT EXISTS ai_permission_rules_local (
        id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, agent_id TEXT,
        record_json TEXT NOT NULL, updated_at TEXT NOT NULL
      )`),
      )
      .then(() =>
        this.db.execute(`CREATE INDEX IF NOT EXISTS ai_permission_rules_local_identity_idx
        ON ai_permission_rules_local(identity_id, agent_id)`),
      )
      .then(() =>
        this.db.execute(`CREATE TABLE IF NOT EXISTS ai_permission_audit_local (
        id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, occurred_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      )`),
      )
      .then(() =>
        this.db.execute(`CREATE INDEX IF NOT EXISTS ai_permission_audit_local_identity_idx
        ON ai_permission_audit_local(identity_id, occurred_at)`),
      )
      .then(() => undefined)
      .catch((error: unknown) => {
        this.ready = undefined;
        throw error;
      });
    return this.ready;
  }

  async getSettings(owner: string): Promise<PermissionSettings | null> {
    return withPermissionStorage(async () => {
      await this.ensureLocalTables();
      const row = await this.db.getOptional<{ record_json: string }>(
        `SELECT record_json FROM ${this.settingsTable} WHERE id = ? AND identity_id = ?`,
        [stableId(owner, 'settings'), owner],
      );
      return row ? PermissionSettingsSchema.parse(JSON.parse(row.record_json)) : null;
    });
  }

  async saveSettings(owner: string, input: PermissionSettings): Promise<void> {
    await this.ensureLocalTables();
    const settings = PermissionSettingsSchema.parse(input);
    await this.db.writeTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO ${this.settingsTable} (id, identity_id, revision, record_json, updated_at)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
         revision = excluded.revision, record_json = excluded.record_json, updated_at = excluded.updated_at
         WHERE ${this.settingsTable}.identity_id = excluded.identity_id`,
        [
          stableId(owner, 'settings'),
          owner,
          settings.revision,
          JSON.stringify(settings),
          new Date().toISOString(),
        ],
      );
    });
  }

  async listRules(owner: string): Promise<PermissionRule[]> {
    return withPermissionStorage(async () => {
      await this.ensureLocalTables();
      const rows = await this.db.getAll<{ record_json: string }>(
        `SELECT record_json FROM ${this.rulesTable} WHERE identity_id = ? ORDER BY id LIMIT 500`,
        [owner],
      );
      return rows.map((row) => PermissionRuleSchema.parse(JSON.parse(row.record_json)));
    });
  }

  async saveRule(owner: string, input: PermissionRule): Promise<void> {
    await this.ensureLocalTables();
    const rule = PermissionRuleSchema.parse(input);
    await this.db.writeTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO ${this.rulesTable} (id, identity_id, agent_id, record_json, updated_at)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
         agent_id = excluded.agent_id, record_json = excluded.record_json, updated_at = excluded.updated_at
         WHERE ${this.rulesTable}.identity_id = excluded.identity_id`,
        [
          stableId(owner, `rule:${rule.id}`),
          owner,
          rule.agentId,
          JSON.stringify(rule),
          new Date().toISOString(),
        ],
      );
    });
  }

  async removeRule(owner: string, ruleId: string): Promise<void> {
    await this.ensureLocalTables();
    await this.db.execute(`DELETE FROM ${this.rulesTable} WHERE id = ? AND identity_id = ?`, [
      stableId(owner, `rule:${ruleId}`),
      owner,
    ]);
  }

  async appendAudit(owner: string, input: PermissionAuditRecord): Promise<void> {
    return withPermissionStorage(async () => {
      await this.ensureLocalTables();
      const record = PermissionAuditRecordSchema.parse(input);
      await this.db.execute(
        `INSERT INTO ${this.auditTable} (id, identity_id, occurred_at, record_json)
       VALUES (?, ?, ?, ?)`,
        [
          stableId(owner, `audit:${record.id || randomUUID()}`),
          owner,
          new Date(record.occurredAt).toISOString(),
          JSON.stringify(record),
        ],
      );
    });
  }

  async updateAuditExecution(
    owner: string,
    auditId: string,
    execution: PermissionAuditRecord['execution'],
  ): Promise<void> {
    return withPermissionStorage(async () => {
      await this.ensureLocalTables();
      const row = await this.db.getOptional<{ record_json: string }>(
        `SELECT record_json FROM ${this.auditTable} WHERE id = ? AND identity_id = ?`,
        [stableId(owner, `audit:${auditId}`), owner],
      );
      if (!row) return;
      const record = PermissionAuditRecordSchema.parse({
        ...JSON.parse(row.record_json),
        execution,
      });
      await this.db.execute(
        `UPDATE ${this.auditTable} SET record_json = ? WHERE id = ? AND identity_id = ?`,
        [JSON.stringify(record), stableId(owner, `audit:${auditId}`), owner],
      );
    });
  }

  async listAudit(owner: string, limit = 100): Promise<PermissionAuditRecord[]> {
    await this.ensureLocalTables();
    const rows = await this.db.getAll<{ record_json: string }>(
      `SELECT record_json FROM ${this.auditTable} WHERE identity_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?`,
      [owner, Math.max(1, Math.min(500, Math.floor(limit)))],
    );
    return rows.map((row) => PermissionAuditRecordSchema.parse(JSON.parse(row.record_json)));
  }
}

/** Desktop permission policy storage stays outside PowerSync's upload queue. */
export class PermissionLocalRepository extends PermissionPowerSyncRepository {
  constructor(db: IElectronDatabase) {
    super(db, true);
  }
}
