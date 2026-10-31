import { PermissionSettingsSchema } from '@memoflow/ai-contracts';
import type { PermissionRepository } from './permission.repository';
import { migrateLegacyPermissionSettings } from './permission-policy';

export interface LegacyPermissionAgent {
  agentId: string;
  writeScopes: readonly string[];
}

/** Idempotently imports native connection scopes before the first permission check. */
export async function migrateLegacyPermissions(
  repository: PermissionRepository,
  owner: string,
  agents: readonly LegacyPermissionAgent[],
): Promise<void> {
  if (await repository.getSettings(owner)) return;
  const migratedAgents = agents.map((agent) => ({
    agent,
    migrated: migrateLegacyPermissionSettings(agent),
  }));
  for (const { migrated } of migratedAgents) {
    for (const rule of migrated.rules) await repository.saveRule(owner, rule);
  }
  await repository.saveSettings(
    owner,
    PermissionSettingsSchema.parse({
      preset: 'on_demand',
      agentPresets: {},
      revision: 1,
      migratedFrom: agents.length ? 'legacy-write-scopes-v2' : 'new-default-v1',
    }),
  );
}
