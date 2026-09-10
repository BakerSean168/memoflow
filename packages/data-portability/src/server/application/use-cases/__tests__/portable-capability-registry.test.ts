import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  PortableCapabilityRegistry,
  type PortableCapability,
} from '../../portable-capability';
import { PortableReferenceRegistry } from '../../portable-reference-registry';

const payloadSchema = z.object({ name: z.string() }).strict();
type Payload = z.infer<typeof payloadSchema>;

function executionContext() {
  return { identityId: 'identity-1', references: new PortableReferenceRegistry() };
}

function createCapability(overrides: Partial<PortableCapability<Payload>> = {}): PortableCapability<Payload> {
  return {
    key: 'goals',
    schemaVersion: 3,
    payloadSchema,
    async export() {
      return { name: 'Goal' };
    },
    async dryRun(payload) {
      return { created: payload.name.length, updated: 0, skipped: 0, warnings: [] };
    },
    async apply(payload) {
      return { created: 1, updated: payload.name.length, skipped: 0, warnings: [] };
    },
    ...overrides,
  };
}

describe('PortableCapabilityRegistry', () => {
  it('registers an owner-typed capability and validates every payload boundary', async () => {
    const registry = new PortableCapabilityRegistry();
    registry.register(createCapability());

    const registered = registry.get('goals');
    expect(registered?.schemaVersion).toBe(3);
    expect(await registered?.exportValidated(executionContext())).toEqual({ name: 'Goal' });
    expect(await registered?.dryRunValidated({ name: 'abc' }, executionContext())).toMatchObject({ created: 3 });
    await expect(
      registered?.applyValidated({ name: 42 }, executionContext()),
    ).rejects.toThrow('Portable capability payload validation failed for goals@3');
  });

  it('rejects duplicate registrations and self dependencies', () => {
    const registry = new PortableCapabilityRegistry();
    registry.register(createCapability());
    expect(() => registry.register(createCapability())).toThrow('already registered');

    const selfDependent = new PortableCapabilityRegistry();
    expect(() =>
      selfDependent.register(createCapability({ key: 'tasks', dependsOn: ['tasks'] })),
    ).toThrow('cannot depend on itself');
  });

  it('fails export if an owner emits a payload that violates its own schema', async () => {
    const registry = new PortableCapabilityRegistry();
    registry.register(
      createCapability({
        async export() {
          return { name: 42 } as unknown as Payload;
        },
      }),
    );

    await expect(registry.get('goals')?.exportValidated(executionContext())).rejects.toThrow(
      'Portable capability payload validation failed for goals@3',
    );
  });
});
