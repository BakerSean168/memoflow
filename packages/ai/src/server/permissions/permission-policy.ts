import type { PermissionAction, PermissionObject, PermissionRisk } from './operation-catalog';
import { getPermissionOperation } from './operation-catalog';

export type PermissionPreset = 'read_only' | 'confirm_each' | 'on_demand' | 'full_auto' | 'custom';
export type PermissionDecision = 'allow' | 'ask' | 'deny';
export type PermissionRuleEffect = PermissionDecision;

export interface PermissionRule {
  id: string;
  agentId: string | null;
  object: PermissionObject;
  action: PermissionAction;
  effect: PermissionRuleEffect;
  source: 'user' | 'migration';
  expiresAt?: number;
}

export function inferCustomPreset(
  matrix: Partial<Record<PermissionObject, Partial<Record<PermissionAction, PermissionDecision>>>>,
): PermissionPreset {
  const cells = Object.entries(matrix).flatMap(([object, permissions]) =>
    Object.entries(permissions ?? {}).map(([action, decision]) => ({
      object: object as PermissionObject,
      action: action as PermissionAction,
      decision: decision as PermissionDecision,
    })),
  );
  if (!cells.length) return 'on_demand';
  for (const preset of ['read_only', 'confirm_each', 'on_demand', 'full_auto'] as const) {
    if (cells.every(({ action, decision }) => decision === PERMISSION_PRESETS[preset][action]))
      return preset;
  }
  return 'custom';
}

export function migrateLegacyPermissionSettings(input: {
  mode?: 'read-only' | 'confirm' | 'auto' | 'read_only' | 'confirm_each' | 'auto_approve';
  writeScopes?: readonly string[];
  agentId: string;
}): {
  preset: PermissionPreset;
  rules: PermissionRule[];
  migratedFrom: string;
} {
  const preset: PermissionPreset =
    input.mode === 'read-only' || input.mode === 'read_only' ? 'read_only' : 'confirm_each';
  const rules: PermissionRule[] = [];
  const scopedObjects: readonly [string, PermissionObject][] = [
    ['goals:write', 'goal'],
    ['tasks:write', 'task'],
    ['routines:write', 'routine'],
  ];
  for (const [scope, object] of scopedObjects) {
    if (!input.writeScopes?.includes(scope)) {
      for (const action of ['create', 'update', 'delete'] as const) {
        rules.push({
          id: `legacy:${input.agentId}:${object}:${action}`,
          agentId: input.agentId,
          object,
          action,
          effect: 'deny',
          source: 'migration',
        });
      }
    }
  }
  return { preset, rules, migratedFrom: input.mode ?? 'missing' };
}

export interface PermissionContext {
  agentId: string;
  operationId: string;
  preset: PermissionPreset;
  globalRules?: readonly PermissionRule[];
  agentRules?: readonly PermissionRule[];
  conversationRules?: readonly PermissionRule[];
  customMatrix?: Partial<
    Record<PermissionObject, Partial<Record<PermissionAction, PermissionDecision>>>
  >;
  now?: number;
}

export interface PermissionEvaluation {
  decision: PermissionDecision;
  reason:
    | 'unregistered'
    | 'permission_settings_locked'
    | 'user_deny'
    | 'ask_rule'
    | 'allow_rule'
    | 'preset';
  operation?: {
    id: string;
    object: PermissionObject;
    action: PermissionAction;
    risks: readonly PermissionRisk[];
  };
  ruleId?: string;
}

export const PERMISSION_PRESETS: Readonly<
  Record<
    Exclude<PermissionPreset, 'custom'>,
    Readonly<Record<PermissionAction, PermissionDecision>>
  >
> = {
  read_only: { read: 'allow', create: 'deny', update: 'deny', delete: 'deny' },
  confirm_each: { read: 'allow', create: 'ask', update: 'ask', delete: 'ask' },
  on_demand: { read: 'allow', create: 'allow', update: 'ask', delete: 'ask' },
  full_auto: {
    read: 'allow',
    create: 'allow',
    update: 'allow',
    delete: 'allow',
  },
};

function activeRules(rules: readonly PermissionRule[], now: number): PermissionRule[] {
  return rules.filter((rule) => rule.expiresAt === undefined || rule.expiresAt > now);
}

export function evaluatePermission(context: PermissionContext): PermissionEvaluation {
  const operation = getPermissionOperation(context.operationId);
  if (!operation) return { decision: 'deny', reason: 'unregistered' };
  const operationView = { ...operation, risks: operation.risks ?? [] };
  if (operation.object === 'ai_permission')
    return {
      decision: 'deny',
      reason: 'permission_settings_locked',
      operation: operationView,
    };

  const now = context.now ?? Date.now();
  const rules = [
    ...activeRules(context.globalRules ?? [], now),
    ...activeRules(context.agentRules ?? [], now),
    ...activeRules(context.conversationRules ?? [], now),
  ].filter((rule) => rule.object === operation.object && rule.action === operation.action);
  const deny = rules.find((rule) => rule.effect === 'deny');
  if (deny)
    return {
      decision: 'deny',
      reason: 'user_deny',
      operation: operationView,
      ruleId: deny.id,
    };
  const ask = [...rules].reverse().find((rule) => rule.effect === 'ask');
  if (ask)
    return {
      decision: 'ask',
      reason: 'ask_rule',
      operation: operationView,
      ruleId: ask.id,
    };
  const allow = [...rules].reverse().find((rule) => rule.effect === 'allow');
  if (allow)
    return {
      decision: 'allow',
      reason: 'allow_rule',
      operation: operationView,
      ruleId: allow.id,
    };

  if (operationView.risks.length) {
    const highRiskDecision =
      context.preset === 'read_only' ? 'deny' : context.preset === 'full_auto' ? 'allow' : 'ask';
    return {
      decision: highRiskDecision,
      reason: 'preset',
      operation: operationView,
    };
  }
  const preset = context.preset === 'custom' ? 'on_demand' : context.preset;
  const decision =
    context.preset === 'custom'
      ? (context.customMatrix?.[operation.object]?.[operation.action] ??
        PERMISSION_PRESETS.on_demand[operation.action])
      : PERMISSION_PRESETS[preset][operation.action];
  return {
    decision,
    reason: 'preset',
    operation: operationView,
  };
}
