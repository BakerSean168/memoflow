import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PortableBackupEnvelopeV3 } from '@memoflow/contracts/data-portability';
import {
  PortableCapabilityCoordinator,
  type PortableCapabilityCoordinatorOptions,
} from '../../portable-capability-coordinator';
import { PortableCapabilityRegistry, type PortableCapability } from '../../portable-capability';
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

  it('passes all imported payloads to dry-run and apply capabilities', async () => {
    const observed: unknown[] = [];
    const preferences = simpleCapability('goals', [], {
      async dryRun() {
        return { created: 0, updated: 0, skipped: 0, warnings: [] };
      },
    });
    const account = simpleCapability('tasks', [], {
      dependsOn: ['goals'],
      async dryRun(_payload, context) {
        observed.push(context.importedCapabilityPayloads?.get('goals'));
        return { created: 0, updated: 0, skipped: 0, warnings: [] };
      },
      async apply(_payload, context) {
        observed.push(context.importedCapabilityPayloads?.get('goals'));
        return { created: 0, updated: 0, skipped: 0, warnings: [] };
      },
    });
    const coordinator = createCoordinator(preferences, account);
    const content = JSON.stringify(
      envelope([
        { key: 'tasks', schemaVersion: 1, payload: { key: 'tasks' } },
        { key: 'goals', schemaVersion: 1, payload: { key: 'goals' } },
      ]),
    );

    await coordinator.dryRun(content, 'target-user', 'dry-batch');
    await coordinator.apply(content, 'target-user', 'apply-batch');

    // dry-run reads once; apply reads once during preflight and once during the
    // real apply, proving the payload map is available on every context.
    expect(observed).toEqual([{ key: 'goals' }, { key: 'goals' }, { key: 'goals' }]);
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
    expect(observed).toEqual(['new-goal-db']);
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

  it('validates mutation-dependent owner rules before applying any capability', async () => {
    const calls: string[] = [];
    const preferences = simpleCapability('goals', calls, {
      async apply() {
        calls.push('apply:preferences');
        return { created: 0, updated: 1, skipped: 0, warnings: [] };
      },
    });
    const account = simpleCapability('tasks', calls, {
      dependsOn: ['goals'],
      async validateImport() {
        throw new Error('account import validation failed');
      },
    });
    const coordinator = createCoordinator(preferences, account);
    const content = JSON.stringify(
      envelope([
        { key: 'goals', schemaVersion: 1, payload: { key: 'goals' } },
        { key: 'tasks', schemaVersion: 1, payload: { key: 'tasks' } },
      ]),
    );

    await expect(coordinator.apply(content, 'target-user', 'apply-batch')).rejects.toThrow(
      'account import validation failed',
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
    await expect(coordinator.export('')).rejects.toThrow(
      'Portable host identity must be non-empty',
    );
  });
});

/**
 * Task-like capabilities: the dependency (`labels`) dry-run binds its own
 * imported refs, and the dependent (`tasks`) dry-run resolves the dependency ref
 * of the relation it predicts. A dependency dry-run binding is therefore
 * observable to a dependent dry-run that shares one operation-local registry,
 * and a drifted dependency binding surfaces as a relation conflict instead of
 * silently passing.
 */
function taskLikeCapabilities(
  calls: string[],
  options: { readonly bindLabelTarget?: (ref: string) => string } = {},
): readonly [PortableCapability<{ labelRef: string }>, PortableCapability<{ ref: string }>] {
  const bindLabelTarget = options.bindLabelTarget ?? ((ref: string) => `host-${ref}`);
  const bindLabels = (
    payload: unknown,
    context: Parameters<PortableCapability<{ ref: string }>['dryRun']>[1],
  ): void => {
    const item = payload as { ref: string };
    context.references.bindImportedReference(
      item.ref as `labels:${number}`,
      bindLabelTarget(item.ref),
    );
  };
  const labelCapability = simpleCapability('labels', calls, {
    async dryRun(payload, context) {
      calls.push('dry:labels');
      bindLabels(payload, context);
      return { created: 1, updated: 0, skipped: 0, warnings: [] };
    },
    async apply(payload, context) {
      calls.push('apply:labels');
      bindLabels(payload, context);
      return { created: 1, updated: 0, skipped: 0, warnings: [] };
    },
  });
  const taskCapability = simpleCapability('tasks', calls, {
    dependsOn: ['labels'],
    async dryRun(payload, context) {
      calls.push('dry:tasks');
      const { labelRef } = payload as { labelRef: string };
      const bound = context.references.hasImportedReference?.(labelRef as `labels:${number}`);
      if (bound !== true) {
        throw new Error(`tasks@3 label reference is not bound: ${labelRef}`);
      }
      const target = context.references.resolveImportedReference(labelRef as `labels:${number}`);
      if (target !== `host-${labelRef}`) {
        throw new Error(`tasks@3 label relation drift: ${labelRef} -> ${target}`);
      }
      return { created: 1, updated: 0, skipped: 0, warnings: [] };
    },
    async apply(payload, context) {
      calls.push('apply:tasks');
      const { labelRef } = payload as { labelRef: string };
      context.references.resolveImportedReference(labelRef as `labels:${number}`);
      return { created: 1, updated: 0, skipped: 0, warnings: [] };
    },
  });
  return [taskCapability, labelCapability] as const;
}

describe('PortableCapabilityCoordinator dependency dry-run binding', () => {
  const labelsPayload = { ref: 'labels:1' };
  const tasksPayload = { labelRef: 'labels:1' };

  function taskLikeEnvelope(): PortableBackupEnvelopeV3 {
    return envelope([
      { key: 'tasks', schemaVersion: 1, payload: tasksPayload },
      { key: 'labels', schemaVersion: 1, payload: labelsPayload },
    ]);
  }

  it('executes dependency dry-runs in topological order on one shared registry and rejects relation drift', async () => {
    const calls: string[] = [];
    const registry = new PortableCapabilityRegistry();
    for (const capability of taskLikeCapabilities(calls)) registry.register(capability);
    const coordinator = new PortableCapabilityCoordinator(registry, options);

    const receipt = await coordinator.dryRun(
      JSON.stringify(taskLikeEnvelope()),
      'target-user',
      'dry-batch',
    );

    expect(calls).toEqual(['dry:labels', 'dry:tasks']);
    expect(receipt.created).toEqual({ labels: 1, tasks: 1 });
    expect(receipt.dryRun).toBe(true);

    // Relation drift: the dependency dry-run binds a target the dependent
    // dry-run rejects, so the drift is observed through the shared registry.
    const conflictCalls: string[] = [];
    const conflictRegistry = new PortableCapabilityRegistry();
    for (const capability of taskLikeCapabilities(conflictCalls, {
      bindLabelTarget: (ref) => `drifted-${ref}`,
    })) {
      conflictRegistry.register(capability);
    }
    const conflictCoordinator = new PortableCapabilityCoordinator(conflictRegistry, options);
    await expect(
      conflictCoordinator.dryRun(JSON.stringify(taskLikeEnvelope()), 'target-user', 'dry-batch'),
    ).rejects.toThrow('tasks@3 label relation drift: labels:1 -> drifted-labels:1');
    expect(conflictCalls).toEqual(['dry:labels', 'dry:tasks']);
  });
});

describe('PortableCapabilityCoordinator apply preflight', () => {
  const labelsPayload = { ref: 'labels:1' };
  const tasksPayload = { labelRef: 'labels:1' };

  function taskLikeEnvelope(): PortableBackupEnvelopeV3 {
    return envelope([
      { key: 'tasks', schemaVersion: 1, payload: tasksPayload },
      { key: 'labels', schemaVersion: 1, payload: labelsPayload },
    ]);
  }

  it('propagates dependency dry-run refs into the dependent dry-run before apply', async () => {
    const calls: string[] = [];
    const coordinator = createCoordinator(...taskLikeCapabilities(calls));
    const receipt = await coordinator.apply(
      JSON.stringify(taskLikeEnvelope()),
      'target-user',
      'apply-batch',
    );

    expect(calls).toEqual(['dry:labels', 'dry:tasks', 'apply:labels', 'apply:tasks']);
    expect(receipt.created).toEqual({ labels: 1, tasks: 1 });
    expect(receipt.dryRun).toBe(false);
  });

  it('prevents all apply mutations when a downstream dry-run fails', async () => {
    const calls: string[] = [];
    const labels = simpleCapability('labels', calls, {
      async dryRun() {
        calls.push('dry:labels');
        return { created: 1, updated: 0, skipped: 0, warnings: [] };
      },
      async apply() {
        calls.push('apply:labels');
        return { created: 1, updated: 0, skipped: 0, warnings: [] };
      },
    });
    const tasks = simpleCapability('tasks', calls, {
      dependsOn: ['labels'],
      async dryRun() {
        calls.push('dry:tasks');
        if (calls.includes('dry:tasks')) throw new Error('tasks@3 dry-run conflict');
        return { created: 0, updated: 0, skipped: 0, warnings: [] };
      },
      async apply() {
        calls.push('apply:tasks');
        return { created: 1, updated: 0, skipped: 0, warnings: [] };
      },
    });
    const coordinator = createCoordinator(tasks, labels);

    await expect(
      coordinator.apply(JSON.stringify(taskLikeEnvelope()), 'target-user', 'apply-batch'),
    ).rejects.toThrow('tasks@3 dry-run conflict');
    expect(calls).toEqual(['dry:labels', 'dry:tasks']);
  });

  it('keeps preflight placeholder refs out of the real apply registry', async () => {
    const calls: string[] = [];
    const preflightTargets: string[] = [];
    const applyTargets: string[] = [];
    const labels = simpleCapability('labels', calls, {
      async dryRun(payload, context) {
        calls.push('dry:labels');
        const item = payload as { ref: string };
        // Preflight binds a placeholder for a label that does not exist yet.
        context.references.bindImportedReference(item.ref as `labels:${number}`, 'placeholder');
        preflightTargets.push(
          context.references.resolveImportedReference(item.ref as `labels:${number}`),
        );
        return { created: 1, updated: 0, skipped: 0, warnings: [] };
      },
      async apply(payload, context) {
        calls.push('apply:labels');
        const item = payload as { ref: string };
        // A leaked preflight binding would make this rebinding throw.
        context.references.bindImportedReference(item.ref as `labels:${number}`, 'host-id');
        applyTargets.push(
          context.references.resolveImportedReference(item.ref as `labels:${number}`),
        );
        return { created: 1, updated: 0, skipped: 0, warnings: [] };
      },
    });
    const coordinator = createCoordinator(labels);

    const receipt = await coordinator.apply(
      JSON.stringify(envelope([{ key: 'labels', schemaVersion: 1, payload: labelsPayload }])),
      'target-user',
      'apply-batch',
    );

    expect(calls).toEqual(['dry:labels', 'apply:labels']);
    // Preflight really did bind a placeholder, and the real apply registry was
    // not polluted by it: rebinding succeeds and resolves to the host id.
    expect(preflightTargets).toEqual(['placeholder']);
    expect(applyTargets).toEqual(['host-id']);
    expect(receipt.created).toEqual({ labels: 1 });
  });
});
