export type PermissionObject =
  | 'goal'
  | 'key_result'
  | 'task'
  | 'routine'
  | 'knowledge'
  | 'notification'
  | 'ai_permission';
export type PermissionAction = 'read' | 'create' | 'update' | 'delete';
export type PermissionRisk = 'delete_permanent' | 'bulk' | 'send_external';

export interface PermissionOperation {
  id: string;
  object: PermissionObject;
  action: PermissionAction;
  risks?: readonly PermissionRisk[];
}

export function goalPanelSubmitOperationId(isEdit: boolean): string {
  return isEdit ? 'goal.update' : 'goal.create';
}

const CRUD = [
  ['read', 'read'],
  ['create', 'create'],
  ['update', 'update'],
  ['delete', 'delete'],
] as const;
const BUSINESS_OBJECTS: readonly PermissionObject[] = [
  'goal',
  'key_result',
  'task',
  'routine',
  'knowledge',
  'notification',
];

export const PERMISSION_OPERATIONS: readonly PermissionOperation[] = [
  ...BUSINESS_OBJECTS.flatMap((object) =>
    CRUD.map(([action]) => ({ id: `${object}.${action}`, object, action })),
  ),
  { id: 'task.plan.create', object: 'task', action: 'create' },
  { id: 'task.plan.update', object: 'task', action: 'update' },
  { id: 'task.occurrence.complete', object: 'task', action: 'update' },
  { id: 'knowledge.search', object: 'knowledge', action: 'read' },
  { id: 'knowledge.get', object: 'knowledge', action: 'read' },
  { id: 'knowledge.note.create', object: 'knowledge', action: 'create' },
  { id: 'knowledge.note.update', object: 'knowledge', action: 'update' },
  {
    id: 'notification.execute_action',
    object: 'notification',
    action: 'update',
  },
  {
    id: 'goal.delete_permanent',
    object: 'goal',
    action: 'delete',
    risks: ['delete_permanent'],
  },
  { id: 'task.bulk_update', object: 'task', action: 'update', risks: ['bulk'] },
  {
    id: 'notification.send_external',
    object: 'notification',
    action: 'create',
    risks: ['send_external'],
  },
  { id: 'ai_permission.update', object: 'ai_permission', action: 'update' },
];

const byId = new Map(PERMISSION_OPERATIONS.map((operation) => [operation.id, operation]));
const TOOL_OPERATIONS: Readonly<Record<string, string>> = {
  goal_get: 'goal.read',
  goal_search: 'goal.read',
  goal_create: 'goal.create',
  goal_update: 'goal.update',
  goal_key_result_create: 'key_result.create',
  goal_key_result_update: 'key_result.update',
  task_plan_get: 'task.read',
  task_plan_search: 'task.read',
  task_plan_create: 'task.plan.create',
  task_plan_update: 'task.plan.update',
  task_occurrence_get: 'task.read',
  task_occurrence_list: 'task.read',
  task_occurrence_complete: 'task.occurrence.complete',
  knowledge_search: 'knowledge.search',
  knowledge_get: 'knowledge.get',
  routine_create: 'routine.create',
};

export function getPermissionOperation(id: string): PermissionOperation | undefined {
  return byId.get(id);
}

export function permissionOperationsFor(object: PermissionObject): readonly PermissionOperation[] {
  return PERMISSION_OPERATIONS.filter((operation) => operation.object === object);
}

export function permissionOperationMcpHints(
  toolName: string,
  options: { isGoalPanelEdit?: boolean } = {},
): { readOnlyHint: boolean; destructiveHint: boolean } | undefined {
  const id =
    toolName === 'goal_panel_submit'
      ? goalPanelSubmitOperationId(options.isGoalPanelEdit ?? false)
      : (TOOL_OPERATIONS[toolName] ?? toolName);
  const operation = getPermissionOperation(id);
  if (!operation) return undefined;
  return {
    readOnlyHint: operation.action === 'read',
    destructiveHint:
      operation.action === 'update' ||
      operation.action === 'delete' ||
      Boolean(operation.risks?.length),
  };
}

export function permissionOperationForTool(
  toolName: string,
  options: { isGoalPanelEdit?: boolean } = {},
): PermissionOperation | undefined {
  const id =
    toolName === 'goal_panel_submit'
      ? goalPanelSubmitOperationId(options.isGoalPanelEdit ?? false)
      : (TOOL_OPERATIONS[toolName] ?? toolName);
  return getPermissionOperation(id);
}
