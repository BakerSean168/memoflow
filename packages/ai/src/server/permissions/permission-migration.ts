import { PermissionSettingsSchema } from '@memoflow/ai-contracts';
import type { PermissionRepository } from './permission.repository';
import { migrateLegacyPermissionSettings } from './permission-policy';

export interface LegacyPermissionAgent {
  agentId: string;
  writeScopes: readonly string[];
  mode?: 'read-only' | 'confirm' | 'auto';
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
    migrated: migrateLegacyPermissionSettings({
      agentId: agent.agentId,
      writeScopes: agent.writeScopes,
      mode:
        agent.mode === 'read-only'
          ? 'read_only'
          : agent.mode === 'auto'
            ? 'auto_approve'
            : 'confirm_each',
    }),
  }));
  for (const { migrated } of migratedAgents) {
    for (const rule of migrated.rules) await repository.saveRule(owner, rule);
  }
  const agentPresets = Object.fromEntries(
    migratedAgents.map(({ agent, migrated }) => [agent.agentId, migrated.preset]),
  );
  await repository.saveSettings(
    owner,
    PermissionSettingsSchema.parse({
      preset: agents.length ? 'confirm_each' : 'on_demand',
      agentPresets,
      revision: 1,
      migratedFrom: agents.length ? 'legacy-write-scopes-v1' : 'new-default-v1',
    }),
  );
}
