import type { AIChatPermissionMode, PermissionPreset } from '@memoflow/ai-contracts';
import type { RequestContext } from '@mastra/core/request-context';
import {
  authorize,
  executeAuthorized,
  permissionOperationForTool,
  evaluatePermission,
  type PermissionRepository,
} from '../../permissions';
import type { PermissionDecision } from '../../permissions';
import { identityId } from './product-tool-context';
import { MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import type { ToolCategory, PermissionPolicy } from '@mastra/core/agent-controller';

function policy(category: ToolCategory, requireApproval: boolean) {
  return Object.freeze({ category, requireApproval });
}

/** MemoFlow owns approval intent; owner authorization remains inside each tool. */
export const MEMOFLOW_PRODUCT_TOOL_POLICY = Object.freeze({
  knowledge_search: policy('read', false),
  workspace_overview: policy('read', false),
  planner_today_summary: policy('read', false),
  planner_conflicts: policy('read', false),
  planner_upcoming_tasks: policy('read', false),
  notification_unread_summary: policy('read', false),
  routine_create: policy('edit', true),
  routine_set_profile_active: policy('edit', true),
  routine_set_temporary_override: policy('edit', true),
  routine_clear_temporary_override: policy('edit', true),
  routine_start_protocol: policy('execute', true),
  notification_execute_action: policy('execute', true),
  routine_pause_protocol: policy('execute', false),
  routine_resume_protocol: policy('execute', false),
  routine_end_protocol: policy('execute', false),
});

export function memoFlowToolPolicy(toolName: string) {
  return Object.prototype.hasOwnProperty.call(MEMOFLOW_PRODUCT_TOOL_POLICY, toolName)
    ? MEMOFLOW_PRODUCT_TOOL_POLICY[toolName as keyof typeof MEMOFLOW_PRODUCT_TOOL_POLICY]
    : undefined;
}

export function memoFlowToolCategory(toolName: string): ToolCategory {
  if (toolName === 'ask_user') return 'read';
  return memoFlowToolPolicy(toolName)?.category ?? 'other';
}

/** Legacy native modes map onto business presets, without bypassing user deny rules. */
export function assistantPermissionPreset(
  mode?: AIChatPermissionMode,
): PermissionPreset | undefined {
  switch (mode) {
    case 'read-only':
      return 'read_only';
    case 'confirm-each':
      return 'confirm_each';
    case 'auto-approve':
      return 'full_auto';
    case 'on-demand':
      return 'on_demand';
    default:
      return undefined;
  }
}

const DECISIONS = 'memoFlowToolDecisions';
type Decisions = Record<string, PermissionDecision>;
function decisions(context: RequestContext): Decisions {
  let value = context.getRaw(DECISIONS) as Decisions | undefined;
  if (!value) {
    value = {};
    context.setRaw(DECISIONS, value);
  }
  return value;
}

function authorizationInput(name: string, context: RequestContext) {
  const agent = context.getRaw('agentInstanceId');
  const conversation = context.getRaw(MASTRA_THREAD_ID_KEY);
  return {
    owner: identityId(context),
    agentId: typeof agent === 'string' ? agent : 'builtin-mastra',
    conversationId: typeof conversation === 'string' ? conversation : null,
    operationId: permissionOperationForTool(name)?.id ?? name,
    conversationPreset: assistantPermissionPreset(
      context.getRaw('permissionMode') as AIChatPermissionMode,
    ),
  };
}

/** Workspace context includes several owner projections; every exposed object must pass. */
function operationIds(name: string): readonly string[] {
  return name === 'workspace_overview'
    ? ['goal.read', 'task.read', 'notification.read']
    : [permissionOperationForTool(name)?.id ?? name];
}

/** Evaluated by Mastra before every tool call, before its native approval suspension. */
export async function checkMemoFlowToolPermission(
  repository: PermissionRepository,
  name: string,
  context: RequestContext,
) {
  const current = decisions(context);
  // An infrastructure failure must never turn into an approvable write.
  current[name] = 'deny';
  const records = await Promise.all(
    operationIds(name).map((operationId) =>
      authorize(repository, { ...authorizationInput(name, context), operationId }),
    ),
  );
  const decision = records.some((record) => record.decision === 'deny')
    ? 'deny'
    : records.some((record) => record.decision === 'ask')
      ? 'ask'
      : 'allow';
  current[name] = decision;
  return decision;
}

/** Preserve the user's native approval answer in the common activity ledger. */
export async function recordMemoFlowToolDecision(
  repository: PermissionRepository,
  name: string,
  context: RequestContext,
  response: 'approve' | 'decline',
): Promise<void> {
  const input = authorizationInput(name, context);
  for (const operationId of operationIds(name)) {
    const operation = permissionOperationForTool(operationId);
    await authorize(repository, {
      ...input,
      operationId,
      conversationRules: operation
        ? [
            {
              id: 'mastra-native-approval',
              agentId: input.agentId,
              object: operation.object,
              action: operation.action,
              effect: 'ask',
              source: 'user',
            },
          ]
        : [],
      ask: async () => (response === 'approve' ? 'allow' : 'deny'),
    });
  }
}

/** The execution boundary rechecks revocations after native approval/resumption. */
export async function executeMemoFlowTool<T>(
  repository: PermissionRepository,
  name: string,
  context: RequestContext,
  work: () => Promise<T>,
): Promise<T> {
  const approved = decisions(context)[name];
  let execute = work;
  for (const operationId of operationIds(name)) {
    const next = execute;
    execute = () =>
      executeAuthorized(
        repository,
        {
          ...authorizationInput(name, context),
          operationId,
          // Only Mastra's preflight can seed this value; approval itself remains native.
          ...(approved === 'ask' ? { ask: async () => 'allow' as const } : {}),
        },
        next,
      );
  }
  return execute();
}

/** Native grants/yolo cannot widen the MemoFlow checkpoint. */
export async function applyMemoFlowSessionToolPolicy(
  session: {
    resolveToolApproval(toolName: string): PermissionPolicy;
    state: { set(updates: Record<string, unknown>): Promise<void> };
  },
  mode: AIChatPermissionMode = 'supervised',
  context?: RequestContext,
): Promise<void> {
  const current = context ? decisions(context) : undefined;
  const permissionFor = (name: string): PermissionPolicy => {
    if (name === 'ask_user') return 'allow';
    if (!memoFlowToolPolicy(name)) return 'deny';
    if (current)
      return Object.prototype.hasOwnProperty.call(current, name) ? current[name]! : 'ask';
    return evaluatePermission({
      agentId: 'builtin-mastra',
      operationId: permissionOperationForTool(name)?.id ?? name,
      preset: assistantPermissionPreset(mode) ?? 'on_demand',
    }).decision;
  };
  await session.state.set({
    yolo: false,
    permissionRules: {
      categories: { other: 'deny' },
      tools: Object.fromEntries(
        [...Object.keys(MEMOFLOW_PRODUCT_TOOL_POLICY), 'ask_user'].map((name) => [
          name,
          permissionFor(name),
        ]),
      ),
    },
  });
  session.resolveToolApproval = permissionFor;
}

export function assertMemoFlowToolClassification(tools: Record<string, { id: string }>): void {
  for (const [name, tool] of Object.entries(tools)) {
    if (!memoFlowToolPolicy(name) || tool.id !== name) {
      throw new Error(`Unclassified MemoFlow Assistant tool: ${name}`);
    }
  }
}
