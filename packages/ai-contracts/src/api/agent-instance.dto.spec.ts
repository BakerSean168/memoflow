import { describe, expect, it } from 'vitest';
import { CreateAgentInstanceSchema, AgentRegistryCommandSchema } from './agent-instance.dto';

describe('Agent registry contracts', () => {
  it('accepts an empty Mastra without a credential or model', () => {
    expect(
      CreateAgentInstanceSchema.parse({
        instanceId: 'mastra-anyrouter',
        driver: 'mastra',
        name: 'AnyRouter',
        accentColor: '#6469da',
        enabled: true,
      }),
    ).toMatchObject({ driver: 'mastra' });
  });
  it('rejects secrets, mutable identity, invalid slugs and missing CAS', () => {
    const input = {
      instanceId: 'mastra-anyrouter',
      driver: 'mastra',
      name: 'AnyRouter',
      accentColor: '#6469da',
      enabled: true,
    };
    expect(CreateAgentInstanceSchema.safeParse({ ...input, apiKey: 'secret' }).success).toBe(false);
    expect(
      CreateAgentInstanceSchema.safeParse({ ...input, instanceId: 'Not a slug' }).success,
    ).toBe(false);
    expect(
      AgentRegistryCommandSchema.safeParse({
        action: 'update',
        instanceId: 'mastra',
        patch: { name: 'New' },
      }).success,
    ).toBe(false);
    expect(
      AgentRegistryCommandSchema.safeParse({
        action: 'update',
        instanceId: 'mastra',
        expectedRevision: 0,
        patch: { driver: 'codex' },
      }).success,
    ).toBe(false);
  });
});
