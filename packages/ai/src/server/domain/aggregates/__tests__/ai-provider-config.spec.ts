import { beforeEach, describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared/shared';
import type { AIProviderCredentialRef } from '@memoflow/contracts/primitives';
import { AIProviderConfig } from '../ai-provider-config';

describe('AIProviderConfig aggregate', () => {
  let identityId: string;

  beforeEach(() => {
    identityId = String(IdentityId.generate());
  });

  function createConfig(
    overrides: Partial<Parameters<typeof AIProviderConfig.create>[0]> = {},
  ): AIProviderConfig {
    return AIProviderConfig.create({
      identityId,
      name: 'Test provider',
      providerDefinitionId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      credentialRef: 'credential-test' as AIProviderCredentialRef,
      ...overrides,
    });
  }

  it('creates a connection with ProviderDefinition identity and credentialRef', () => {
    const config = createConfig({ name: '  OpenAI Config  ' });

    expect(config.name).toBe('OpenAI Config');
    expect(config.providerDefinitionId).toBe('openai');
    expect(config.credentialRef).toBe('credential-test');
    expect(config.isActive).toBe(true);
    expect(config.isDefault).toBe(false);
    expect(config.priority).toBe(100);
    expect(config.version).toBe(1);
    expect(config.deletedAt).toBeNull();
    expect(config.domainEvents).toHaveLength(1);
    expect(config.domainEvents[0]).toMatchObject({
      payload: expect.objectContaining({
        providerConnection: expect.objectContaining({
        providerDefinitionId: 'openai',
        credentialRef: 'credential-test',
        }),
      }),
    });
  });

  it('normalizes the base URL and updates connection metadata', () => {
    const config = createConfig({ baseUrl: 'https://api.openai.com/v1/' });

    expect(config.baseUrl).toBe('https://api.openai.com/v1');
    config.updateBaseUrl('https://custom.example/v2/');
    expect(config.baseUrl).toBe('https://custom.example/v2');
    config.updateName('Updated name');
    expect(config.name).toBe('Updated name');
  });

  it('rotates only the opaque credential reference', () => {
    const config = createConfig();

    config.updateCredentialRef('credential-new' as AIProviderCredentialRef);
    expect(config.credentialRef).toBe('credential-new');
    expect(() => config.updateCredentialRef('' as AIProviderCredentialRef)).toThrow(
      'Credential reference cannot be empty',
    );
    expect(() => config.updateCredentialRef('   ' as AIProviderCredentialRef)).toThrow(
      'Credential reference cannot be empty',
    );
  });

  it('preserves active/default/fallback ordering state transitions', () => {
    const config = createConfig({ isDefault: true, priority: 50 });
    expect(config.isDefault).toBe(true);
    expect(config.priority).toBe(50);

    config.deactivate();
    expect(config.isActive).toBe(false);
    expect(config.isDefault).toBe(false);
    expect(() => config.setAsDefault()).toThrow('Cannot set inactive provider as default');

    config.activate();
    config.setAsDefault();
    expect(config.isActive).toBe(true);
    expect(config.isDefault).toBe(true);
    config.unsetDefault();
    expect(config.isDefault).toBe(false);
  });

  it('validates name and priority without storing secret material', () => {
    const config = createConfig();

    expect(() => config.updateName('')).toThrow();
    expect(() => config.updateName('A'.repeat(51))).toThrow();
    expect(() => config.updatePriority(0)).toThrow();
    expect(() => config.updatePriority(1000)).toThrow();
    expect('apiKey' in config).toBe(false);
    expect('apiKey' in config.toServerDTO()).toBe(false);
    expect('apiKey' in config.toClientDTO()).toBe(false);
  });

  it('serializes server and client connection DTOs without plaintext credentials', () => {
    const config = createConfig({ defaultModel: 'gpt-4o-mini' });
    const serverDto = config.toServerDTO();
    const clientDto = config.toClientDTO();

    expect(serverDto).toMatchObject({
      providerDefinitionId: 'openai',
      credentialRef: 'credential-test',
      defaultModel: 'gpt-4o-mini',
    });
    expect(clientDto).toMatchObject({
      providerDefinitionId: 'openai',
      credentialRef: 'credential-test',
    });
    expect(JSON.stringify(serverDto)).not.toContain('apiKey');
    expect(JSON.stringify(serverDto)).not.toContain('plain-secret');
    expect(JSON.stringify(clientDto)).not.toContain('apiKey');
    expect(JSON.stringify(clientDto)).not.toContain('plain-secret');
  });

  it('loads a persisted connection state with a credentialRef', () => {
    const config = AIProviderConfig.load({
      id: { value: 'IAiProviderConfigId_123' } as never,
      identityId: IdentityId.generate(),
      name: 'Loaded Config',
      providerDefinitionId: 'custom',
      baseUrl: 'https://custom.example/v1',
      credentialRef: 'credential-loaded' as AIProviderCredentialRef,
      defaultModel: 'manual-model',
      isActive: true,
      isDefault: false,
      priority: 50,
      version: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    expect(config.providerDefinitionId).toBe('custom');
    expect(config.credentialRef).toBe('credential-loaded');
    expect(config.version).toBe(5);
  });
});
