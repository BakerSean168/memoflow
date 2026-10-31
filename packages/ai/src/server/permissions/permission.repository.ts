import type {
  PermissionAuditRecord,
  PermissionRule,
  PermissionSettings,
} from "@memoflow/ai-contracts";

export interface PermissionRepository {
  getSettings(owner: string): Promise<PermissionSettings | null>;
  saveSettings(owner: string, settings: PermissionSettings): Promise<void>;
  listRules(owner: string): Promise<PermissionRule[]>;
  saveRule(owner: string, rule: PermissionRule): Promise<void>;
  removeRule(owner: string, ruleId: string): Promise<void>;
  appendAudit(owner: string, record: PermissionAuditRecord): Promise<void>;
  updateAuditExecution(
    owner: string,
    auditId: string,
    execution: PermissionAuditRecord["execution"],
  ): Promise<void>;
  listAudit(owner: string, limit?: number): Promise<PermissionAuditRecord[]>;
}
