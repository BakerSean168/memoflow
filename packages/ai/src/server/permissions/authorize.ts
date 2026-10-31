import { randomUUID } from 'node:crypto';
import type {
  PermissionAuditRecord,
  PermissionPreset,
  PermissionSettings,
} from '@memoflow/ai-contracts';
import { evaluatePermission, type PermissionRule } from './permission-policy';
import type { PermissionRepository } from './permission.repository';

export interface AuthorizeInput {
  owner: string;
  agentId: string;
  conversationId?: string | null;
  operationId: string;
  conversationPreset?: PermissionPreset;
  conversationRules?: readonly PermissionRule[];
  now?: number;
  ask?: (auditId: string) => Promise<'allow' | 'deny' | 'timeout'>;
}

function isPermissionTableUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; message?: unknown; cause?: unknown };
  if (value.code === 'P2021') return true;
  const message = typeof value.message === 'string' ? value.message : '';
  return /(?:no such table|does not exist|undefined table).*ai_permission|ai_permission.*(?:no such table|does not exist|undefined table)/iu.test(
    message,
  );
}

export async function authorize(
  repository: PermissionRepository,
  input: AuthorizeInput,
): Promise<PermissionAuditRecord> {
  let settings: PermissionSettings | null = null;
  let rules: PermissionRule[] = [];
  let storageUnavailable = false;
  try {
    [settings, rules] = await Promise.all([
      repository.getSettings(input.owner),
      repository.listRules(input.owner),
    ]);
  } catch (error) {
    if (!isPermissionTableUnavailable(error)) throw error;
    storageUnavailable = true;
  }
  const preset = (input.conversationPreset ??
    settings?.agentPresets[input.agentId] ??
    settings?.preset ??
    'on_demand') as PermissionPreset;
  const result = evaluatePermission({
    agentId: input.agentId,
    operationId: input.operationId,
    preset,
    globalRules: rules.filter((rule) => rule.agentId === null),
    agentRules: rules.filter((rule) => rule.agentId === input.agentId),
    conversationRules: input.conversationRules,
    customMatrix: settings?.customMatrix,
    now: input.now,
  });
  const auditId = randomUUID();
  let decision = result.decision;
  let decidedBy: PermissionAuditRecord['decidedBy'] =
    result.reason === 'preset'
      ? 'preset'
      : result.reason === 'permission_settings_locked' || result.reason === 'unregistered'
        ? 'system'
        : 'rule';
  if (decision === 'ask' && input.ask) {
    const response = await input.ask(auditId);
    decision = response === 'allow' ? 'allow' : 'deny';
    decidedBy = response === 'timeout' ? 'timeout' : 'user';
  }
  const record = {
    id: auditId,
    occurredAt: input.now ?? Date.now(),
    agentId: input.agentId,
    conversationId: input.conversationId ?? null,
    operationId: input.operationId,
    object: result.operation?.object ?? null,
    action: result.operation?.action ?? null,
    decision,
    decidedBy,
    ruleId: result.ruleId ?? null,
    execution: 'not_started' as const,
  } satisfies PermissionAuditRecord;
  try {
    await repository.appendAudit(input.owner, record);
  } catch (error) {
    if (!storageUnavailable && !isPermissionTableUnavailable(error)) throw error;
  }
  return record;
}

export async function executeAuthorized<T>(
  repository: PermissionRepository,
  input: AuthorizeInput,
  work: () => Promise<T>,
): Promise<T> {
  const audit = await authorize(repository, input);
  if (audit.decision !== 'allow') throw new PermissionDeniedError(audit.decision, audit.id);
  try {
    const result = await work();
    try {
      await repository.updateAuditExecution(input.owner, audit.id, 'succeeded');
    } catch (error) {
      if (!isPermissionTableUnavailable(error)) throw error;
    }
    return result;
  } catch (error) {
    try {
      await repository.updateAuditExecution(input.owner, audit.id, 'failed');
    } catch (auditError) {
      if (!isPermissionTableUnavailable(auditError)) throw auditError;
    }
    throw error;
  }
}

export class PermissionDeniedError extends Error {
  constructor(
    readonly decision: 'ask' | 'deny',
    readonly auditId: string,
  ) {
    super('Agent operation is not authorized');
  }
}
