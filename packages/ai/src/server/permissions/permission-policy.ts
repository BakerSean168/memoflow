import type { PermissionAction, PermissionObject, PermissionRisk } from './operation-catalog';
import { getPermissionOperation } from './operation-catalog';

export type PermissionPreset = 'read_only' | 'confirm_each' | 'on_demand' | 'full_auto' | 'custom';
export type PermissionDecision = 'allow' | 'ask' | 'deny';
export type PermissionRuleEffect = PermissionDecision;

/** Issue #762 default: a call affecting more than this many objects is bulk. */
export const DEFAULT_BULK_THRESHOLD = 10;

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
  writeScopes?: readonly string[];
  agentId: string;
}): {
  preset: PermissionPreset;
  rules: PermissionRule[];
  migratedFrom: string;
} {
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
  return { preset: 'confirm_each', rules, migratedFrom: 'legacy-write-scopes-v2' };
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
  /** How many objects this single call affects; enables dynamic bulk risk. */
  itemCount?: number;
  /** Per-evaluation override for {@link DEFAULT_BULK_THRESHOLD}. */
  bulkThreshold?: number;
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
  // Legacy preset: now aliases the common read/write confirmation mode.
  on_demand: { read: 'allow', create: 'ask', update: 'ask', delete: 'ask' },
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
  // Issue #762: one call affecting more objects than the threshold is bulk by
  // nature, even when the operation itself is statically unremarkable. Reads are
  // exempt because they consume no data. Only the strict greater-than boundary
  // escalates, so `itemCount === threshold` stays an ordinary call.
  const bulk =
    context.itemCount !== undefined &&
    context.itemCount > (context.bulkThreshold ?? DEFAULT_BULK_THRESHOLD) &&
    operation.action !== 'read';
  if (bulk && !operationView.risks.includes('bulk'))
    operationView.risks = [...operationView.risks, 'bulk'];
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
  // A global read-only selection cannot be silently raised by an earlier grant.
  if (context.preset === 'read_only' && operation.action !== 'read')
    return { decision: 'deny', reason: 'preset', operation: operationView };
  // #762 phase 4: elevated-risk operations — permanent deletion, bulk
  // (statically registered or dynamically detected above), and external send —
  // always require a fresh, in-the-moment confirmation. No preset, not even
  // full_auto, and no remembered allow rule or grant ever auto-approves them;
  // only an explicit user deny or the read-only preset (both handled above)
  // can refuse them outright. This deliberately diverges from mainstream
  // coding agents, whose widest mode auto-approves deletions: MemoFlow holds
  // personal data with no version-control safety net underneath, and a
  // permanent deletion by definition bypasses the recycle-bin net.
  if (operationView.risks.length)
    return { decision: 'ask', reason: 'preset', operation: operationView };
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
