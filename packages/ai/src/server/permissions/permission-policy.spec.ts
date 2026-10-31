import { describe, expect, it } from 'vitest';
import {
  evaluatePermission,
  migrateLegacyPermissionSettings,
  PERMISSION_PRESETS,
  type PermissionPreset,
} from './permission-policy';
import {
  goalPanelSubmitOperationId,
  permissionOperationMcpHints,
  PERMISSION_OPERATIONS,
} from './operation-catalog';

describe('evaluatePermission', () => {
  it('registers each operation exactly once', () => {
    const operationIds = PERMISSION_OPERATIONS.map((operation) => operation.id);
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  it.each(
    (Object.keys(PERMISSION_PRESETS) as Exclude<PermissionPreset, 'custom'>[]).flatMap((preset) =>
      (['read', 'create', 'update', 'delete'] as const).map((action) => [preset, action] as const),
    ),
  )('%s preset follows the %s matrix cell', (preset, action) => {
    const operation = PERMISSION_OPERATIONS.find(
      (candidate) => candidate.object === 'goal' && candidate.action === action,
    )!;
    expect(
      evaluatePermission({
        agentId: 'codex',
        operationId: operation.id,
        preset,
      }).decision,
    ).toBe(PERMISSION_PRESETS[preset][action]);
  });

  it('fails closed for unknown operations and locks permission changes in every preset', () => {
    expect(
      evaluatePermission({
        agentId: 'codex',
        operationId: 'goal.publish',
        preset: 'full_auto',
      }),
    ).toMatchObject({ decision: 'deny', reason: 'unregistered' });
    expect(
      evaluatePermission({
        agentId: 'codex',
        operationId: 'ai_permission.update',
        preset: 'full_auto',
      }),
    ).toMatchObject({ decision: 'deny', reason: 'permission_settings_locked' });
  });

  it('keeps user denies above allow rules and presets, while ask rules outrank allow rules', () => {
    const context = {
      agentId: 'codex',
      operationId: 'goal.update',
      preset: 'full_auto' as const,
      globalRules: [
        {
          id: 'allow',
          agentId: null,
          object: 'goal' as const,
          action: 'update' as const,
          effect: 'allow' as const,
          source: 'user' as const,
        },
      ],
      agentRules: [
        {
          id: 'deny',
          agentId: 'codex',
          object: 'goal' as const,
          action: 'update' as const,
          effect: 'deny' as const,
          source: 'user' as const,
        },
      ],
    };
    expect(evaluatePermission(context)).toMatchObject({
      decision: 'deny',
      reason: 'user_deny',
      ruleId: 'deny',
    });
    expect(
      evaluatePermission({
        ...context,
        agentRules: [{ ...context.agentRules[0]!, id: 'ask', effect: 'ask' }],
      }),
    ).toMatchObject({ decision: 'ask', reason: 'ask_rule' });
  });

  it('supports conversation scoped temporary rules without mutating the preset', () => {
    const result = evaluatePermission({
      agentId: 'codex',
      operationId: 'goal.update',
      preset: 'read_only',
      now: 10,
      conversationRules: [
        {
          id: 'temporary',
          agentId: 'codex',
          object: 'goal',
          action: 'update',
          effect: 'allow',
          source: 'user',
          expiresAt: 20,
        },
      ],
    });
    expect(result).toMatchObject({ decision: 'allow', ruleId: 'temporary' });
    expect(
      evaluatePermission({
        agentId: 'codex',
        operationId: 'goal.update',
        preset: 'read_only',
        now: 20,
        conversationRules: [
          {
            id: 'expired',
            agentId: 'codex',
            object: 'goal',
            action: 'update',
            effect: 'allow',
            source: 'user',
            expiresAt: 20,
          },
        ],
      }).decision,
    ).toBe('deny');
  });

  it('maps goal panel submission according to draft state', () => {
    expect(goalPanelSubmitOperationId(false)).toBe('goal.create');
    expect(goalPanelSubmitOperationId(true)).toBe('goal.update');
  });

  it('migrates old session modes conservatively and preserves missing write scopes as denies', () => {
    const migration = migrateLegacyPermissionSettings({
      mode: 'auto_approve',
      writeScopes: ['goals:write'],
      agentId: 'codex',
    });
    expect(migration.preset).toBe('confirm_each');
    expect(migration.rules).toHaveLength(6);
    expect(
      evaluatePermission({
        agentId: 'codex',
        operationId: 'task.create',
        preset: migration.preset,
        agentRules: migration.rules,
      }),
    ).toMatchObject({ decision: 'deny', reason: 'user_deny' });
    expect(migrateLegacyPermissionSettings({ mode: 'read-only', agentId: 'codex' }).preset).toBe(
      'read_only',
    );
  });

  it.each([
    ['read_only', 'deny'],
    ['confirm_each', 'ask'],
    ['on_demand', 'ask'],
    ['full_auto', 'allow'],
  ] as const)('applies the high risk default for %s', (preset, decision) => {
    expect(
      evaluatePermission({
        agentId: 'codex',
        operationId: 'task.bulk_update',
        preset,
      }),
    ).toMatchObject({ decision, reason: 'preset' });
  });

  it('uses custom matrix cells and derives MCP hint metadata from the operation catalog', () => {
    expect(
      evaluatePermission({
        agentId: 'codex',
        operationId: 'goal.update',
        preset: 'custom',
        customMatrix: { goal: { update: 'allow' } },
      }).decision,
    ).toBe('allow');
    expect(permissionOperationMcpHints('goal.create')).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
    });
    expect(permissionOperationMcpHints('task.bulk_update')).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
    });
    expect(permissionOperationMcpHints('unregistered')).toBeUndefined();
    expect(permissionOperationMcpHints('task_plan_create')).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
    });
    expect(permissionOperationMcpHints('knowledge_search')).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(
      permissionOperationMcpHints('goal_panel_submit', {
        isGoalPanelEdit: true,
      }),
    ).toEqual({ readOnlyHint: false, destructiveHint: true });
  });
});
