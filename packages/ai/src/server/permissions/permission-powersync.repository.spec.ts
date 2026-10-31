import { expect, it } from "vitest";
import { createLocalAgentSqlite } from "../../testing/local-agent-sqlite";
import { PermissionPowerSyncRepository } from "./permission-powersync.repository";

it("persists owner scoped permission settings, rules and append-only audit rows", async () => {
  const db = createLocalAgentSqlite();
  const repository = new PermissionPowerSyncRepository(db);
  try {
    await repository.saveSettings("owner", {
      preset: "on_demand",
      agentPresets: {},
      revision: 3,
    });
    await repository.saveRule("owner", {
      id: "task-update-deny",
      agentId: null,
      object: "task",
      action: "update",
      effect: "deny",
      source: "user",
    });
    await repository.saveRule("other", {
      id: "task-update-deny",
      agentId: null,
      object: "task",
      action: "update",
      effect: "deny",
      source: "user",
    });
    const event = {
      id: "event-1",
      occurredAt: 1_800_000_000_000,
      agentId: "codex",
      conversationId: "chat",
      operationId: "task.update",
      object: "task" as const,
      action: "update" as const,
      decision: "deny" as const,
      decidedBy: "rule" as const,
      ruleId: "task-update-deny",
      execution: "not_started" as const,
    };
    await repository.appendAudit("owner", event);
    await repository.updateAuditExecution("owner", event.id, "succeeded");
    expect(await repository.getSettings("owner")).toMatchObject({
      preset: "on_demand",
      revision: 3,
    });
    expect(await repository.listRules("owner")).toHaveLength(1);
    expect(await repository.listRules("other")).toHaveLength(1);
    expect(await repository.listAudit("owner")).toEqual([
      { ...event, execution: "succeeded" },
    ]);
    await repository.removeRule("owner", "task-update-deny");
    expect(await repository.listRules("owner")).toEqual([]);
    expect(await repository.listRules("other")).toHaveLength(1);
  } finally {
    db.close();
  }
});
