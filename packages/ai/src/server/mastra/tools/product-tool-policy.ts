import type { ToolCategory, PermissionPolicy } from '@mastra/core/agent-controller';

function policy(category: ToolCategory, permission: 'allow' | 'ask', requireApproval: boolean) {
  return Object.freeze({ category, permission, requireApproval });
}

/** MemoFlow owns approval intent; owner authorization remains inside each tool. */
export const MEMOFLOW_PRODUCT_TOOL_POLICY = Object.freeze({
  knowledge_search: policy('read', 'allow', false),
  workspace_overview: policy('read', 'allow', false),
  planner_today_summary: policy('read', 'allow', false),
  planner_conflicts: policy('read', 'allow', false),
  planner_upcoming_tasks: policy('read', 'allow', false),
  notification_unread_summary: policy('read', 'allow', false),
  routine_create: policy('edit', 'ask', true),
  routine_set_profile_active: policy('edit', 'ask', true),
  routine_set_temporary_override: policy('edit', 'ask', true),
  routine_clear_temporary_override: policy('edit', 'ask', true),
  routine_start_protocol: policy('execute', 'ask', true),
  notification_execute_action: policy('execute', 'ask', true),
  routine_pause_protocol: policy('execute', 'allow', false),
  routine_resume_protocol: policy('execute', 'allow', false),
  routine_end_protocol: policy('execute', 'allow', false),
});

export function memoFlowToolPolicy(toolName: string) {
  return Object.prototype.hasOwnProperty.call(MEMOFLOW_PRODUCT_TOOL_POLICY, toolName)
    ? MEMOFLOW_PRODUCT_TOOL_POLICY[toolName as keyof typeof MEMOFLOW_PRODUCT_TOOL_POLICY]
    : undefined;
}

export function memoFlowToolCategory(toolName: string): ToolCategory {
  return memoFlowToolPolicy(toolName)?.category ?? 'other';
}

/** Native resolution permits yolo/grants and inherited keys; neither can widen this allowlist. */
export async function applyMemoFlowSessionToolPolicy(session: {
  resolveToolApproval(toolName: string): PermissionPolicy;
  state: { set(updates: Record<string, unknown>): Promise<void> };
}): Promise<void> {
  await session.state.set({
    yolo: false,
    permissionRules: {
      categories: { other: 'deny' },
      tools: Object.fromEntries(
        Object.entries(MEMOFLOW_PRODUCT_TOOL_POLICY).map(([name, rule]) => [name, rule.permission]),
      ),
    },
  });
  session.resolveToolApproval = (toolName) => memoFlowToolPolicy(toolName)?.permission ?? 'deny';
}

export function assertMemoFlowToolClassification(tools: Record<string, { id: string }>): void {
  for (const [name, tool] of Object.entries(tools)) {
    if (!memoFlowToolPolicy(name) || tool.id !== name) {
      throw new Error(`Unclassified MemoFlow Assistant tool: ${name}`);
    }
  }
}
