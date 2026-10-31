export type PermissionObject =
  | "goal"
  | "key_result"
  | "task"
  | "routine"
  | "knowledge"
  | "notification"
  | "ai_permission";
export type PermissionAction = "read" | "create" | "update" | "delete";
export type PermissionRisk = "delete_permanent" | "bulk" | "send_external";

export interface PermissionOperation {
  id: string;
  object: PermissionObject;
  action: PermissionAction;
  risks?: readonly PermissionRisk[];
}

export function goalPanelSubmitOperationId(isEdit: boolean): string {
  return isEdit ? "goal.update" : "goal.create";
}

const CRUD = [
  ["read", "read"],
  ["create", "create"],
  ["update", "update"],
  ["delete", "delete"],
] as const;
const BUSINESS_OBJECTS: readonly PermissionObject[] = [
  "goal",
  "key_result",
  "task",
  "routine",
  "knowledge",
  "notification",
];

export const PERMISSION_OPERATIONS: readonly PermissionOperation[] = [
  ...BUSINESS_OBJECTS.flatMap((object) =>
    CRUD.map(([action]) => ({ id: `${object}.${action}`, object, action })),
  ),
  {
    id: "goal.delete_permanent",
    object: "goal",
    action: "delete",
    risks: ["delete_permanent"],
  },
  { id: "task.bulk_update", object: "task", action: "update", risks: ["bulk"] },
  {
    id: "notification.send_external",
    object: "notification",
    action: "create",
    risks: ["send_external"],
  },
  { id: "ai_permission.update", object: "ai_permission", action: "update" },
];

const byId = new Map(
  PERMISSION_OPERATIONS.map((operation) => [operation.id, operation]),
);

export function getPermissionOperation(
  id: string,
): PermissionOperation | undefined {
  return byId.get(id);
}

export function permissionOperationsFor(
  object: PermissionObject,
): readonly PermissionOperation[] {
  return PERMISSION_OPERATIONS.filter(
    (operation) => operation.object === object,
  );
}

export function permissionOperationMcpHints(
  id: string,
): { readOnlyHint: boolean; destructiveHint: boolean } | undefined {
  const operation = getPermissionOperation(id);
  if (!operation) return undefined;
  return {
    readOnlyHint: operation.action === "read",
    destructiveHint:
      operation.action === "update" ||
      operation.action === "delete" ||
      Boolean(operation.risks?.length),
  };
}
