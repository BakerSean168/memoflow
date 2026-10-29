import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PowerSyncDatabase } from "@powersync/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AIProviderConnectionServerDTO } from "@memoflow/ai-contracts";
import { AISecretCipher } from "../../security/ai-secret-cipher";
import { PowerSyncAIProviderSecretVault } from "./ai-provider-secret-powersync.vault";
import { PowerSyncAIProviderOnboardingSessionRepository } from "./ai-provider-onboarding-session-powersync.repository";
import { PowerSyncAIProviderConfigRepository } from "./ai-provider-config-powersync.repository";
import { PowerSyncAIProviderOnboardingCommitAdapter } from "./ai-provider-onboarding-commit-powersync.adapter";

let db: PowerSyncDatabase;
let dbPath: string;
let vault: PowerSyncAIProviderSecretVault;
let sessions: PowerSyncAIProviderOnboardingSessionRepository;
const now = 1750000000000;
const provider = {
  id: "provider",
  identityId: "identity",
  name: "Example",
  providerDefinitionId: "openai",
  baseUrl: "https://example.test/v1",
  credentialRef: "new",
  defaultModel: "model",
  isActive: true,
  isDefault: true,
  priority: 100,
  version: 8,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
} as AIProviderConnectionServerDTO;
const replaceInput = {
  identityId: "identity",
  onboardingId: "session",
  targetProviderId: "provider",
  expectedVersion: 7,
  replacement: provider,
  previousCredentialRef: "old",
  now,
};

beforeEach(async () => {
  const { PowerSyncAppSchema } = await import("@memoflow/powersync-schema");
  dbPath = path.join(os.tmpdir(), `memoflow-ai-${randomUUID()}.db`);
  db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: dbPath },
  });
  await db.waitForReady();
  for (const table of [
    "ai_provider_secrets",
    "ai_provider_onboarding_sessions",
    "ai_provider_configs",
  ]) {
    expect(
      await db.get("SELECT type FROM sqlite_master WHERE name = ?", [table]),
    ).toEqual({
      type: "view",
    });
  }
  vault = new PowerSyncAIProviderSecretVault(
    db,
    new AISecretCipher("test-only-key-material-at-least-32-characters"),
  );
  sessions = new PowerSyncAIProviderOnboardingSessionRepository(db);
});
afterEach(async () => {
  await db.close();
  for (const suffix of ["", "-wal", "-shm"])
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
});
async function secret(id = "new") {
  await db.execute(
    "INSERT INTO ai_provider_secrets (id, identity_id, encrypted_value, expires_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
    [id, "identity", "test-ciphertext", now + 100],
  );
}
async function session(target: string | null = null) {
  await sessions.create({
    id: "session",
    identityId: "identity",
    catalogId: "openai",
    baseUrl: provider.baseUrl,
    targetProviderId: target,
    credentialRef: provider.credentialRef,
    credentialStatus: "valid",
    discoveryStatus: "succeeded",
    models: [],
    expiresAt: now + 100,
    now,
  });
}
async function currentProvider() {
  await db.execute(
    `INSERT INTO ai_provider_configs (id, identity_id, name, base_url, credential_ref, version, is_active, is_default, deleted_at) VALUES ('provider', 'identity', 'Example', ?, 'old', 7, 1, 0, NULL)`,
    [provider.baseUrl],
  );
}
const snapshot = async () =>
  Promise.all(
    [
      "ai_provider_secrets",
      "ai_provider_onboarding_sessions",
      "ai_provider_configs",
    ].map((table) => db.getAll(`SELECT * FROM ${table} ORDER BY id`)),
  );

describe("#20 secret vault on real PowerSync", () => {
  it("replaces a usable credential and resolves the new encrypted value", async () => {
    const credentialRef = await vault.store({
      identityId: "identity",
      value: "before",
    });
    await expect(
      vault.replace({
        identityId: "identity",
        credentialRef,
        value: "after",
        now,
      }),
    ).resolves.toBeUndefined();
    expect(
      await vault.resolve({ identityId: "identity", credentialRef, now }),
    ).toEqual({
      value: "after",
    });
  });
  it.each(["missing", "foreign", "expired", "revoked"])(
    "rejects %s replace without writes",
    async (kind) => {
      await secret();
      if (kind === "expired")
        await db.execute("UPDATE ai_provider_secrets SET expires_at = ?", [
          now,
        ]);
      if (kind === "revoked")
        await db.execute("UPDATE ai_provider_secrets SET revoked_at = ?", [
          now,
        ]);
      const before = await snapshot();
      await expect(
        vault.replace({
          identityId: kind === "foreign" ? "foreign" : "identity",
          credentialRef: (kind === "missing" ? "missing" : "new") as never,
          value: "after",
          now,
        }),
      ).rejects.toThrow("AI provider credential is unavailable");
      expect(await snapshot()).toEqual(before);
    },
  );
  it("revokes once, permits replay, and rejects missing/foreign references", async () => {
    await secret();
    const input = {
      identityId: "identity",
      credentialRef: "new" as never,
      now,
    };
    await vault.revoke(input);
    expect(await db.get("SELECT revoked_at FROM ai_provider_secrets")).toEqual({
      revoked_at: now,
    });
    await vault.revoke({ ...input, now: now + 1 });
    expect(await db.get("SELECT revoked_at FROM ai_provider_secrets")).toEqual({
      revoked_at: now,
    });
    await expect(
      vault.revoke({ ...input, identityId: "foreign" }),
    ).rejects.toThrow("AI provider credential is unavailable");
    await expect(
      vault.revoke({ ...input, credentialRef: "missing" as never }),
    ).rejects.toThrow("AI provider credential is unavailable");
  });
});
describe("#21 onboarding session on real PowerSync", () => {
  it("marks verified models and deduplicates replay", async () => {
    await session();
    const input = {
      identityId: "identity",
      onboardingId: "session",
      modelId: "model",
      now,
    };
    expect((await sessions.markModelVerified(input))?.verifiedModelIds).toEqual(
      ["model"],
    );
    expect((await sessions.markModelVerified(input))?.verifiedModelIds).toEqual(
      ["model"],
    );
  });
  it("consumes exactly once", async () => {
    await session();
    const input = { identityId: "identity", onboardingId: "session", now };
    expect(await sessions.markConsumed(input)).toBe(true);
    expect(await sessions.markConsumed(input)).toBe(false);
  });
  it.each(["foreign", "expired", "consumed", "missing"])(
    "refuses %s session mutations",
    async (kind) => {
      await session();
      if (kind === "expired")
        await db.execute(
          "UPDATE ai_provider_onboarding_sessions SET expires_at = ?",
          [now],
        );
      if (kind === "consumed")
        await db.execute(
          "UPDATE ai_provider_onboarding_sessions SET consumed_at = ?",
          [now],
        );
      const before = await snapshot();
      const input = {
        identityId: kind === "foreign" ? "foreign" : "identity",
        onboardingId: kind === "missing" ? "missing" : "session",
        now,
      };
      expect(
        await sessions.markModelVerified({ ...input, modelId: "model" }),
      ).toBeNull();
      expect(await sessions.markConsumed(input)).toBe(false);
      expect(await snapshot()).toEqual(before);
    },
  );
});
describe("#22 provider default on real PowerSync", () => {
  it("sets the default and increments the stored version", async () => {
    await currentProvider();
    expect(
      await new PowerSyncAIProviderConfigRepository(db).setDefaultForIdentity(
        "identity",
        "provider",
      ),
    ).toBe("SET");
    expect(
      await db.get("SELECT is_default, version FROM ai_provider_configs"),
    ).toEqual({
      is_default: 1,
      version: 8,
    });
  });
  it.each(["foreign", "inactive", "deleted", "missing"])(
    "preserves rows for %s default target",
    async (kind) => {
      await currentProvider();
      if (kind === "inactive")
        await db.execute("UPDATE ai_provider_configs SET is_active = 0");
      if (kind === "deleted")
        await db.execute(
          "UPDATE ai_provider_configs SET deleted_at = 'deleted'",
        );
      const before = await snapshot();
      expect(
        await new PowerSyncAIProviderConfigRepository(db).setDefaultForIdentity(
          kind === "foreign" ? "foreign" : "identity",
          kind === "missing" ? "missing" : "provider",
        ),
      ).toBe("NOT_FOUND");
      expect(await snapshot()).toEqual(before);
    },
  );
});
describe("#23 onboarding commit on real PowerSync", () => {
  it("creates once, activates the secret and refuses replay", async () => {
    await session();
    await secret();
    const adapter = new PowerSyncAIProviderOnboardingCommitAdapter(db);
    const input = {
      identityId: "identity",
      onboardingId: "session",
      provider,
      now,
    };
    expect(await adapter.commit(input)).toBe("COMMITTED");
    expect(await db.get("SELECT expires_at FROM ai_provider_secrets")).toEqual({
      expires_at: null,
    });
    expect(
      await db.get("SELECT consumed_at FROM ai_provider_onboarding_sessions"),
    ).toEqual({
      consumed_at: now,
    });
    expect(await db.getAll("SELECT id FROM ai_provider_configs")).toEqual([
      { id: "provider" },
    ]);
    expect(await adapter.commit(input)).toBe("SESSION_UNAVAILABLE");
  });
  it("rolls back creation when the secret is unavailable", async () => {
    await session();
    const before = await snapshot();
    await expect(
      new PowerSyncAIProviderOnboardingCommitAdapter(db).commit({
        identityId: "identity",
        onboardingId: "session",
        provider,
        now,
      }),
    ).rejects.toThrow("AI provider credential is unavailable");
    expect(await snapshot()).toEqual(before);
  });
  it("replaces atomically, activates new and revokes old secret", async () => {
    await session("provider");
    await currentProvider();
    await secret();
    await secret("old");
    const adapter = new PowerSyncAIProviderOnboardingCommitAdapter(db);
    expect(await adapter.replace(replaceInput)).toBe("REPLACED");
    expect(
      await db.get("SELECT version, credential_ref FROM ai_provider_configs"),
    ).toEqual({
      version: 8,
      credential_ref: "new",
    });
    expect(
      await db.get(
        "SELECT expires_at FROM ai_provider_secrets WHERE id = 'new'",
      ),
    ).toEqual({
      expires_at: null,
    });
    expect(
      await db.get(
        "SELECT revoked_at FROM ai_provider_secrets WHERE id = 'old'",
      ),
    ).toEqual({
      revoked_at: now,
    });
    expect(await adapter.replace(replaceInput)).toBe("SESSION_UNAVAILABLE");
  });
  it.each(["new", "old"])(
    "rolls back replacement when %s secret is unavailable",
    async (missing) => {
      await session("provider");
      await currentProvider();
      await secret(missing === "new" ? "old" : "new");
      const before = await snapshot();
      await expect(
        new PowerSyncAIProviderOnboardingCommitAdapter(db).replace(
          replaceInput,
        ),
      ).rejects.toThrow("AI provider credential is unavailable");
      expect(await snapshot()).toEqual(before);
    },
  );
  it.each(["version", "foreign", "expired", "binding", "provider"])(
    "rejects %s replacement without consuming session",
    async (kind) => {
      await session(kind === "binding" ? null : "provider");
      await currentProvider();
      if (kind === "expired")
        await db.execute(
          "UPDATE ai_provider_onboarding_sessions SET expires_at = ?",
          [now],
        );
      if (kind === "provider")
        await db.execute("DELETE FROM ai_provider_configs");
      const before = await snapshot();
      expect(
        await new PowerSyncAIProviderOnboardingCommitAdapter(db).replace({
          ...replaceInput,
          expectedVersion: kind === "version" ? 6 : 7,
          identityId: kind === "foreign" ? "foreign" : "identity",
        }),
      ).toBe(
        kind === "version"
          ? "CONFLICT"
          : kind === "provider"
            ? "PROVIDER_NOT_FOUND"
            : "SESSION_UNAVAILABLE",
      );
      expect(await snapshot()).toEqual(before);
    },
  );
});

describe("real-table lease exception", () => {
  it("keeps rowsAffected CAS on the self-created lease table", async () => {
    const { AiGoalSurfaceLeasePowerSyncRepository } =
      await import("./ai-goal-surface-lease.powersync");
    const lease = new AiGoalSurfaceLeasePowerSyncRepository(db);
    const input = {
      identityId: "identity",
      runId: "run",
      token: "token",
      now,
      expiresAt: now + 100,
    };
    const grant = await lease.claim(input);
    expect(
      await db.get(
        "SELECT type FROM sqlite_master WHERE name = 'ai_goal_surface_leases'",
      ),
    ).toEqual({ type: "table" });
    expect(grant?.fence).toBe(1);
    expect(await lease.renew({ ...input, fence: 1 })).toBe(true);
    expect(await lease.renew({ ...input, fence: 2 })).toBe(false);
    expect(await lease.release({ ...input, fence: 2 })).toBe(false);
    expect(await lease.release({ ...input, fence: 1 })).toBe(true);
  });
});
