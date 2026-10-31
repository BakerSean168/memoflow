import { createHash, randomUUID } from "node:crypto";
import {
  PermissionAuditRecordSchema,
  PermissionRuleSchema,
  PermissionSettingsSchema,
  type PermissionAuditRecord,
  type PermissionRule,
  type PermissionSettings,
} from "@memoflow/ai-contracts";
import type { IElectronDatabase } from "@memoflow/desktop-contracts";
import type { PermissionRepository } from "./permission.repository";

function stableId(owner: string, suffix: string): string {
  const ownerKey = createHash("sha256").update(owner).digest("hex");
  return `${ownerKey}:${suffix}`;
}

export class PermissionPowerSyncRepository implements PermissionRepository {
  constructor(private readonly db: IElectronDatabase) {}

  async getSettings(owner: string): Promise<PermissionSettings | null> {
    const row = await this.db.getOptional<{ record_json: string }>(
      "SELECT record_json FROM ai_permission_settings WHERE id = ? AND identity_id = ?",
      [stableId(owner, "settings"), owner],
    );
    return row
      ? PermissionSettingsSchema.parse(JSON.parse(row.record_json))
      : null;
  }

  async saveSettings(owner: string, input: PermissionSettings): Promise<void> {
    const settings = PermissionSettingsSchema.parse(input);
    await this.db.writeTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO ai_permission_settings (id, identity_id, revision, record_json, updated_at)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
         revision = excluded.revision, record_json = excluded.record_json, updated_at = excluded.updated_at
         WHERE ai_permission_settings.identity_id = excluded.identity_id`,
        [
          stableId(owner, "settings"),
          owner,
          settings.revision,
          JSON.stringify(settings),
          new Date().toISOString(),
        ],
      );
    });
  }

  async listRules(owner: string): Promise<PermissionRule[]> {
    const rows = await this.db.getAll<{ record_json: string }>(
      "SELECT record_json FROM ai_permission_rules WHERE identity_id = ? ORDER BY id LIMIT 500",
      [owner],
    );
    return rows.map((row) =>
      PermissionRuleSchema.parse(JSON.parse(row.record_json)),
    );
  }

  async saveRule(owner: string, input: PermissionRule): Promise<void> {
    const rule = PermissionRuleSchema.parse(input);
    await this.db.writeTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO ai_permission_rules (id, identity_id, agent_id, record_json, updated_at)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
         agent_id = excluded.agent_id, record_json = excluded.record_json, updated_at = excluded.updated_at
         WHERE ai_permission_rules.identity_id = excluded.identity_id`,
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
    await this.db.execute(
      "DELETE FROM ai_permission_rules WHERE id = ? AND identity_id = ?",
      [stableId(owner, `rule:${ruleId}`), owner],
    );
  }

  async appendAudit(
    owner: string,
    input: PermissionAuditRecord,
  ): Promise<void> {
    const record = PermissionAuditRecordSchema.parse(input);
    await this.db.execute(
      `INSERT INTO ai_permission_audit (id, identity_id, occurred_at, record_json)
       VALUES (?, ?, ?, ?)`,
      [
        stableId(owner, `audit:${record.id || randomUUID()}`),
        owner,
        new Date(record.occurredAt).toISOString(),
        JSON.stringify(record),
      ],
    );
  }

  async updateAuditExecution(
    owner: string,
    auditId: string,
    execution: PermissionAuditRecord["execution"],
  ): Promise<void> {
    const row = await this.db.getOptional<{ record_json: string }>(
      "SELECT record_json FROM ai_permission_audit WHERE id = ? AND identity_id = ?",
      [stableId(owner, `audit:${auditId}`), owner],
    );
    if (!row) return;
    const record = PermissionAuditRecordSchema.parse({
      ...JSON.parse(row.record_json),
      execution,
    });
    await this.db.execute(
      "UPDATE ai_permission_audit SET record_json = ? WHERE id = ? AND identity_id = ?",
      [JSON.stringify(record), stableId(owner, `audit:${auditId}`), owner],
    );
  }

  async listAudit(
    owner: string,
    limit = 100,
  ): Promise<PermissionAuditRecord[]> {
    const rows = await this.db.getAll<{ record_json: string }>(
      "SELECT record_json FROM ai_permission_audit WHERE identity_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?",
      [owner, Math.max(1, Math.min(500, Math.floor(limit)))],
    );
    return rows.map((row) =>
      PermissionAuditRecordSchema.parse(JSON.parse(row.record_json)),
    );
  }
}
