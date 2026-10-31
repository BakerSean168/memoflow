import { withPermissionStorage } from '../infrastructure/adapters/permission-storage-error';
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@memoflow/database';
import {
  PermissionAuditRecordSchema,
  PermissionRuleSchema,
  PermissionSettingsSchema,
  type PermissionAuditRecord,
  type PermissionRule,
  type PermissionSettings,
} from '@memoflow/ai-contracts';
import type { PermissionRepository } from './permission.repository';

function id(owner: string, suffix: string): string {
  return `${createHash('sha256').update(owner).digest('hex')}:${suffix}`;
}

/** Cloud owner-scoped policy; Desktop local rules are deliberately not uploaded. */
export class PermissionPrismaRepository implements PermissionRepository {
  constructor(
    private readonly db: Pick<
      PrismaClient,
      'aiPermissionSetting' | 'aiPermissionRule' | 'aiPermissionAudit'
    >,
  ) {}

  async getSettings(owner: string): Promise<PermissionSettings | null> {
    return withPermissionStorage(async () => {
      const row = await this.db.aiPermissionSetting.findFirst({
        where: { identityId: owner },
      });
      return row ? PermissionSettingsSchema.parse(JSON.parse(row.recordJson)) : null;
    });
  }
  async saveSettings(owner: string, input: PermissionSettings): Promise<void> {
    const settings = PermissionSettingsSchema.parse(input);
    await this.db.aiPermissionSetting.upsert({
      where: { id: id(owner, 'settings') },
      create: {
        id: id(owner, 'settings'),
        identityId: owner,
        revision: settings.revision,
        recordJson: JSON.stringify(settings),
      },
      update: {
        revision: settings.revision,
        recordJson: JSON.stringify(settings),
      },
    });
  }
  async listRules(owner: string): Promise<PermissionRule[]> {
    return withPermissionStorage(async () => {
      const rows = await this.db.aiPermissionRule.findMany({
        where: { identityId: owner },
        orderBy: { id: 'asc' },
        take: 500,
      });
      return rows.map((row) => PermissionRuleSchema.parse(JSON.parse(row.recordJson)));
    });
  }
  async saveRule(owner: string, input: PermissionRule): Promise<void> {
    const rule = PermissionRuleSchema.parse(input);
    const data = { agentId: rule.agentId, recordJson: JSON.stringify(rule) };
    await this.db.aiPermissionRule.upsert({
      where: { id: id(owner, `rule:${rule.id}`) },
      create: { id: id(owner, `rule:${rule.id}`), identityId: owner, ...data },
      update: data,
    });
  }
  async removeRule(owner: string, ruleId: string): Promise<void> {
    await this.db.aiPermissionRule.deleteMany({
      where: { identityId: owner, id: id(owner, `rule:${ruleId}`) },
    });
  }
  async appendAudit(owner: string, input: PermissionAuditRecord): Promise<void> {
    return withPermissionStorage(async () => {
      const record = PermissionAuditRecordSchema.parse(input);
      await this.db.aiPermissionAudit.create({
        data: {
          id: id(owner, `audit:${record.id}`),
          identityId: owner,
          occurredAt: new Date(record.occurredAt),
          recordJson: JSON.stringify(record),
        },
      });
    });
  }
  async updateAuditExecution(
    owner: string,
    auditId: string,
    execution: PermissionAuditRecord['execution'],
  ): Promise<void> {
    return withPermissionStorage(async () => {
      const where = { id: id(owner, `audit:${auditId}`), identityId: owner };
      const row = await this.db.aiPermissionAudit.findFirst({ where });
      if (!row) return;
      const record = PermissionAuditRecordSchema.parse({
        ...JSON.parse(row.recordJson),
        execution,
      });
      await this.db.aiPermissionAudit.updateMany({
        where,
        data: { recordJson: JSON.stringify(record) },
      });
    });
  }
  async listAudit(owner: string, limit = 100): Promise<PermissionAuditRecord[]> {
    const rows = await this.db.aiPermissionAudit.findMany({
      where: { identityId: owner },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: Math.max(1, Math.min(500, Math.floor(limit))),
    });
    return rows.map((row) => PermissionAuditRecordSchema.parse(JSON.parse(row.recordJson)));
  }
}
