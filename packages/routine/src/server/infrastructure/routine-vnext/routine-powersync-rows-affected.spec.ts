import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PowerSyncDatabase } from "@powersync/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RoutinePreferences } from "../../domain/routine";
import { PowerSyncRoutinePreferencesStore } from "./routine-preferences-store.powersync";

let db: PowerSyncDatabase;
let dbPath: string;
const now = new Date("2026-10-29T00:00:00.000Z");
const tables = [
  "routine_definitions",
  "routine_profiles",
  "routine_profile_memberships",
  "routine_preferences",
  "routine_occurrences",
  "routine_temporary_overrides",
  "routine_protocol_sessions",
  "routine_interactions",
];
beforeEach(async () => {
  const { PowerSyncAppSchema } = await import("@memoflow/powersync-schema");
  dbPath = path.join(os.tmpdir(), `memoflow-routine-${randomUUID()}.db`);
  db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: dbPath },
  });
  await db.waitForReady();
  for (const table of tables) {
    expect(
      await db.get("SELECT type FROM sqlite_master WHERE name = ?", [table]),
    ).toEqual({ type: "view" });
  }
});
afterEach(async () => {
  await db.close();
  for (const suffix of ["", "-wal", "-shm"])
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

describe("routine writes on real PowerSync views (#709)", () => {
  for (const expectedVersion of [1, 9]) {
    it(`preferences CAS with expected version ${expectedVersion}`, async () => {
      const store = new PowerSyncRoutinePreferencesStore(db);
      const preferences = RoutinePreferences.create({
        identityId: "identity",
        globalEnabled: true,
        now,
      });
      await store.create({ preferences });
      preferences.setGlobalEnabled(false, new Date(now.getTime() + 1000));
      if (expectedVersion === 1) {
        await expect(
          store.update({ preferences, expectedVersion }),
        ).resolves.toBeUndefined();
        expect(
          (await store.find({ identityId: "identity" }))?.snapshot(),
        ).toEqual(preferences.snapshot());
      } else {
        await expect(
          store.update({ preferences, expectedVersion }),
        ).rejects.toThrow("Routine preferences version conflict");
        expect((await store.find({ identityId: "identity" }))?.version).toBe(1);
      }
    });
  }
  it("preserves missing preferences conflict", async () => {
    const store = new PowerSyncRoutinePreferencesStore(db);
    const preferences = RoutinePreferences.create({
      identityId: "missing",
      globalEnabled: true,
      now,
    });
    await expect(
      store.update({ preferences, expectedVersion: 1 }),
    ).rejects.toThrow("Routine preferences version conflict");
    expect(await store.find({ identityId: "missing" })).toBeNull();
  });
});
