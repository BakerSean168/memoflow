import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PortableBackupEnvelopeV3 } from '@memoflow/contracts/data-portability';
import {
  PortableCapabilityCoordinator,
  type PortableCapabilityCoordinatorOptions,
} from '../../portable-capability-coordinator';
import {
  PortableCapabilityRegistry,
  type PortableCapability,
} from '../../portable-capability';
import { PortableReferenceRegistry } from '../../portable-reference-registry';

const options: PortableCapabilityCoordinatorOptions = {
  productVersion: '1.0.0',
  nowIsoString: () => '2026-09-10T04:40:00.000Z',
  createBatchId: () => 'batch-1',
};

function envelope(
  capabilities: PortableBackupEnvelopeV3['capabilities'],
): PortableBackupEnvelopeV3 {
  return {
    format: 'memoflow.user-data-export',
    schemaVersion: 3,
    exportedAt: '2026-09-10T04:40:00.000Z',
    productVersion: '1.0.0',
    capabilities,
  };
}

function createCoordinator(...capabilities: PortableCapability<unknown>[]) {
  const registry = new PortableCapabilityRegistry();
  for (const capability of capabilities) registry.register(capability);
  return new PortableCapabilityCoordinator(registry, options);
}

function simpleCapability(
  key: 'goals' | 'tasks',
  calls: string[],
  overrides: Partial<PortableCapability<unknown>> = {},
): PortableCapability<unknown> {
  return {
    key,
    schemaVersion: 1,
    payloadSchema: z.unknown(),
    async export() {
      calls.push(`export:${key}`);
      return { key };
    },
    async dryRun() {
      calls.push(`dry:${key}`);
      return { created: 0, updated: 0, skipped: 0, warnings: [] };
    },
    async apply() {
      calls.push(`apply:${key}`);
      return { created: 0, updated: 0, skipped: 0, warnings: [] };
    },
    ...overrides,
  };
}

describe('PortableReferenceRegistry', () => {
  it('allocates stable capability-scoped refs and keeps private ids operation-local', () => {
    const references = new PortableReferenceRegistry();
    expect(references.declareExportReference('goals', 'db-goal-9')).toBe('goals:1');
    expect(references.declareExportReference('goals', 'db-goal-9')).toBe('goals:1');
    expect(references.declareExportReference('goals', 'db-goal-10')).toBe('goals:2');
    expect(references.declareExportReference('tasks', 'db-task-2')).toBe('tasks:1');
    expect(references.resolveExportReference('goals', 'db-goal-9')).toBe('goals:1');
    expect(() => references.resolveExportReference('goals', 'unknown')).toThrow(
      'Portable export reference is not declared: goals',
    );
  });

  it('binds imported refs once and rejects conflicting rebinding', () => {
    const references = new PortableReferenceRegistry();
    references.bindImportedReference('goals:1', 'new-goal-db');
    references.bindImportedReference('goals:1', 'new-goal-db');
    expect(references.resolveImportedReference('goals:1')).toBe('new-goal-db');
    expect(() => references.bindImportedReference('goals:1', 'other-goal-db')).toThrow(
      'Portable import reference already bound: goals:1',
    );
    expect(() => references.resolveImportedReference('goals:2')).toThrow(
      'Portable import reference is not bound: goals:2',
    );
  });
});

describe('PortableCapabilityCoordinator', () => {
  it('exports dependency closure in topological order and shares stable refs', async () => {
    const calls: string[] = [];
    const goalSchema = z.object({ ref: z.string() }).strict();
    const taskSchema = z.object({ goalRef: z.string() }).strict();
    const goals: PortableCapability<z.infer<typeof goalSchema>> = {
      key: 'goals',
      schemaVersion: 3,
      payloadSchema: goalSchema,
      async export(context) {
        calls.push('export:goals');
        return { ref: context.references.declareExportReference('goals', 'db-goal-9') };
      },
      async dryRun() {
        return { created: 0, updated: 0, skipped: 0, warnings: [] };
      },
      async apply() {
        return { created: 0, updated: 0, skipped: 0, warnings: [] };
      },
    };
    const tasks: PortableCapability<z.infer<typeof taskSchema>> = {
      key: 'tasks',
      schemaVersion: 3,
      dependsOn: ['goals'],
      payloadSchema: taskSchema,
      async export(context) {
        calls.push('export:tasks');
        return { goalRef: context.references.resolveExportReference('goals', 'db-goal-9') };
      },
      async dryRun() {
        return { created: 0, updated: 0, skipped: 0, warnings: [] };
      },
      async apply() {
        return { created: 0, updated: 0, skipped: 0, warnings: [] };
      },
    };
    const registry = new PortableCapabilityRegistry();
    registry.register(goals);
    registry.register(tasks);
    const coordinator = new PortableCapabilityCoordinator(registry, options);

    const result = await coordinator.export('target-user', ['tasks']);
    expect(calls).toEqual(['export:goals', 'export:tasks']);
    expect(result.capabilityKeys).toEqual(['goals', 'tasks']);
    expect(result.envelope.capabilities).toEqual([
      { key: 'goals', schemaVersion: 3, payload: { ref: 'goals:1' } },
      { key: 'tasks', schemaVersion: 3, payload: { goalRef: 'goals:1' } },
    ]);
    expect(JSON.stringify(result.envelope)).not.toContain('db-goal-9');
  });

  it('rejects non-JSON or banned owner export payloads before returning an envelope', async () => {
    const calls: string[] = [];
    const banned = simpleCapability('goals', calls, {
      payloadSchema: z.object({ identityId: z.string() }).strict(),
      async export() {
        return { identityId: 'private-source-user' };
      },
    });
    const coordinator = createCoordinator(banned);
    await expect(coordinator.export('target-user')).rejects.toThrow(
      'Portable owner export produced an unsafe V3 envelope',
    );

    const nonJson = simpleCapability('goals', calls, {
      payloadSchema: z.object({ when: z.date() }).strict(),
      async export() {
        return { when: new Date('2026-09-10T00:00:00.000Z') };
      },
    });
    const nonJsonCoordinator = createCoordinator(nonJson);
    await expect(nonJsonCoordinator.export('target-user')).rejects.toThrow(
      'Portable owner export produced an unsafe V3 envelope',
    );
  });

  it('dry-runs in dependency order without calling apply and aggregates receipts', async () => {
    const calls: string[] = [];
    const identities: string[] = [];
    const goals = simpleCapability('goals', calls, {
      async dryRun(_payload, context) {
        calls.push('dry:goals');
        identities.push(context.identityId);
        return { created: 2, updated: 1, skipped: 0, warnings: ['goal warning'] };
      },
      async apply() {
        calls.push('apply:goals');
        return { created: 0, updated: 0, skipped: 0, warnings: [] };
      },
    });
    const tasks = simpleCapability('tasks', calls, {
      dependsOn: ['goals'],
      async dryRun(_payload, context) {
        calls.push('dry:tasks');
        identities.push(context.identityId);
        return { created: 3, updated: 0, skipped: 1, warnings: [] };
      },
      async apply() {
        calls.push('apply:tasks');
        return { created: 0, updated: 0, skipped: 0, warnings: [] };
      },
    });
    const coordinator = createCoordinator(goals, tasks);
    const content = JSON.stringify(
      envelope([
        { key: 'tasks', schemaVersion: 1, payload: { key: 'tasks' } },
        { key: 'goals', schemaVersion: 1, payload: { key: 'goals' } },
      ]),
    );

    const receipt = await coordinator.dryRun(content, 'target-user', 'dry-batch');
    expect(calls).toEqual(['dry:goals', 'dry:tasks']);
    expect(identities).toEqual(['target-user', 'target-user']);
    expect(receipt).toMatchObject({
      batchId: 'dry-batch',
      dryRun: true,
      created: { goals: 2, tasks: 3 },
      updated: { goals: 1, tasks: 0 },
      skipped: { goals: 0, tasks: 1 },
      warnings: ['goals: goal warning'],
    });
  });

  it('applies roots before dependents so cross-capability refs can resolve', async () => {
    const observed: string[] = [];
    const refSchema = z.object({ ref: z.literal('goals:1') }).strict();
    const goals: PortableCapability<z.infer<typeof refSchema>> = {
      key: 'goals',
      schemaVersion: 1,
      payloadSchema: refSchema,
      async export() {
        return null;
      },
      async dryRun() {
        return { created: 0, updated: 0, skipped: 0, warnings: [] };
      },
      async apply(payload, context) {
        observed.push('goals');
        context.references.bindImportedReference(payload.ref, 'new-goal-db');
        return { created: 1, updated: 0, skipped: 0, warnings: [] };
      },
    };
    const tasks: PortableCapability<z.infer<typeof refSchema>> = {
      key: 'tasks',
      schemaVersion: 1,
      dependsOn: ['goals'],
      payloadSchema: refSchema,
      async export() {
        return null;
      },
      async dryRun() {
        return { created: 0, updated: 0, skipped: 0, warnings: [] };
      },
      async apply(payload, context) {
        observed.push(context.references.resolveImportedReference(payload.ref));
        return { created: 1, updated: 0, skipped: 0, warnings: [] };
      },
    };
    const registry = new PortableCapabilityRegistry();
    registry.register(goals);
    registry.register(tasks);
    const coordinator = new PortableCapabilityCoordinator(registry, options);

    await coordinator.apply(
      JSON.stringify(
        envelope([
          { key: 'tasks', schemaVersion: 1, payload: { ref: 'goals:1' } },
          { key: 'goals', schemaVersion: 1, payload: { ref: 'goals:1' } },
        ]),
      ),
      'target-user',
      'apply-batch',
    );
    expect(observed).toEqual(['goals', 'new-goal-db']);
  });

  it('prevalidates every capability/version before the first apply mutation', async () => {
    const calls: string[] = [];
    const goals = simpleCapability('goals', calls);
    const tasks = simpleCapability('tasks', calls, { dependsOn: ['goals'] });
    const coordinator = createCoordinator(goals, tasks);
    const content = JSON.stringify(
      envelope([
        { key: 'goals', schemaVersion: 1, payload: { key: 'goals' } },
        { key: 'tasks', schemaVersion: 2, payload: { key: 'tasks' } },
      ]),
    );

    await expect(coordinator.apply(content, 'target-user')).rejects.toThrow(
      'Portable capability version mismatch for tasks: expected 1, received 2',
    );
    expect(calls).toEqual([]);
  });

  it('rejects missing payload dependencies, unknown capabilities, and dependency cycles', async () => {
    const calls: string[] = [];
    const tasks = simpleCapability('tasks', calls, { dependsOn: ['goals'] });
    const registry = new PortableCapabilityRegistry();
    registry.register(tasks);
    const coordinator = new PortableCapabilityCoordinator(registry, options);
    await expect(
      coordinator.dryRun(
        JSON.stringify(envelope([{ key: 'tasks', schemaVersion: 1, payload: {} }])),
        'target-user',
      ),
    ).rejects.toThrow('Portable capability tasks requires missing payload dependency goals');

    await expect(
      coordinator.dryRun(
        JSON.stringify(envelope([{ key: 'goals', schemaVersion: 1, payload: {} }])),
        'target-user',
      ),
    ).rejects.toThrow('Portable capability is not registered: goals');

    const cyclicRegistry = new PortableCapabilityRegistry();
    cyclicRegistry.register(simpleCapability('goals', calls, { dependsOn: ['tasks'] }));
    cyclicRegistry.register(simpleCapability('tasks', calls, { dependsOn: ['goals'] }));
    const cyclicCoordinator = new PortableCapabilityCoordinator(cyclicRegistry, options);
    await expect(cyclicCoordinator.export('target-user', ['tasks'])).rejects.toThrow(
      'Portable capability dependency cycle',
    );
  });

  it('rejects invalid JSON and empty host identity', async () => {
    const coordinator = createCoordinator();
    expect(() => coordinator.decode('{bad json')).toThrow('Portable V3 content is not valid JSON');
    await expect(coordinator.export('')).rejects.toThrow('Portable host identity must be non-empty');
  });
});
