import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PowerSyncAIProviderConfigMapper } from '../adapters/powersync/mappers/powersync-ai-provider-config.mapper';
import { createAIProviderConfigServerDTO } from '../../../testing/ai-test-support';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../');

function source(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
}

describe('AI provider secret ownership surface', () => {
  it('keeps public connection DTOs and repository projections secret-free', () => {
    const clientDto = source(
      'packages/contracts/src/modules/ai/aggregates/ai-provider-config-client.ts',
    );
    const serverDto = source(
      'packages/contracts/src/modules/ai/aggregates/ai-provider-config-server.ts',
    );
    const domain = source('packages/ai/src/server/domain/aggregates/ai-provider-config.ts');
    const prismaRepository = source(
      'packages/ai/src/server/infrastructure/adapters/prisma/ai-provider-config-prisma.repository.ts',
    );
    const powersyncMapper = source(
      'packages/ai/src/server/infrastructure/adapters/powersync/mappers/powersync-ai-provider-config.mapper.ts',
    );
    const dto = createAIProviderConfigServerDTO();
    const persistence = PowerSyncAIProviderConfigMapper.toPersistence(dto);

    expect(clientDto).not.toMatch(/apiKey(?:Masked)?\s*:/);
    expect(serverDto).not.toMatch(/apiKey(?:Masked)?\s*:/);
    expect(domain).not.toMatch(/apiKey(?:Masked)?\s*:/);
    expect(prismaRepository).not.toContain('apiKeyEncrypted');
    expect(powersyncMapper).not.toContain('api_key_encrypted');
    expect(JSON.stringify(dto)).not.toContain('plain-secret');
    expect(JSON.stringify(persistence)).not.toContain('plain-secret');
    expect(JSON.stringify(persistence)).not.toContain('apiKey');
    expect(JSON.stringify(persistence)).toContain('credential_ref');
  });

  it('keeps SecretVault storage out of the PowerSync upload surface', () => {
    const powersyncSchema = source('packages/powersync-schema/src/index.ts');
    const syncConfig = source('docker/powersync/sync-config.yaml');
    const desktopPowerSync = source('apps/desktop/src/main/database/powersync.ts');
    const prismaSchema = source('packages/database/prisma/schema/ai.prisma');
    const providerConfigBlock = prismaSchema.slice(
      prismaSchema.indexOf('model AiProviderConfig'),
      prismaSchema.indexOf('model AiProviderOnboardingSession'),
    );
    const onboardingBlock = prismaSchema.slice(
      prismaSchema.indexOf('model AiProviderOnboardingSession'),
      prismaSchema.indexOf('model AiProviderSecret'),
    );

    expect(providerConfigBlock).not.toContain('apiKeyEncrypted');
    expect(providerConfigBlock).not.toContain('api_key_encrypted');
    expect(onboardingBlock).not.toContain('credentialEncrypted');
    expect(onboardingBlock).not.toContain('credential_encrypted');
    expect(powersyncSchema).toContain('const ai_provider_configs = new Table(');
    expect(powersyncSchema).toMatch(/const ai_provider_configs[\s\S]*?\{ localOnly: true \}/);
    expect(powersyncSchema).toContain('const ai_provider_secrets = new Table(');
    expect(powersyncSchema).toMatch(/const ai_provider_secrets[\s\S]*?\{ localOnly: true \}/);
    expect(desktopPowerSync).toContain("'ai_provider_configs'");
    expect(desktopPowerSync).toContain("'ai_provider_secrets'");
    expect(syncConfig).not.toContain('ai_provider_configs');
    expect(syncConfig).not.toContain('ai_provider_secrets');
    expect(syncConfig).not.toContain('api_key_encrypted');

    const tableMapping = source('apps/api/src/modules/powersync/table-mapping.ts');
    expect(tableMapping).not.toContain("'ai_provider_configs'");
    expect(tableMapping).not.toContain('aiProviderConfig');
  });
});
