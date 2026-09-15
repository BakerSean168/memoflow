import { describe, expect, it, vi } from 'vitest';
import type {
  PortableCapabilityExecutionContext,
  PortableReferencePort,
  PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import type { LabelDto } from '@memoflow/contracts/label';
import type { LabelService } from './label-service';
import { LabelPortableCapability } from './label-portability';

function label(id: string, name: string, color: `#${string}` | null): LabelDto {
  return {
    id,
    identityId: 'identity-1',
    name,
    normalizedName: name.trim().toLocaleLowerCase(),
    color,
    createdAt: 1,
    updatedAt: 1,
  };
}

function executionContext() {
  let nextRef = 0;
  const exported = new Map<string, PortableReferenceV3>();
  const imported = new Map<PortableReferenceV3, string>();
  const references: PortableReferencePort = {
    declareExportReference(capabilityKey, sourceKey) {
      const ref = `${capabilityKey}:${++nextRef}` as PortableReferenceV3;
      exported.set(`${capabilityKey}:${sourceKey}`, ref);
      return ref;
    },
    resolveExportReference(capabilityKey, sourceKey) {
      const ref = exported.get(`${capabilityKey}:${sourceKey}`);
      if (!ref) throw new Error('missing export ref');
      return ref;
    },
    bindImportedReference(portableRef, targetKey) {
      imported.set(portableRef, targetKey);
    },
    resolveImportedReference(portableRef) {
      const target = imported.get(portableRef);
      if (!target) throw new Error('missing imported ref');
      return target;
    },
  };
  return {
    context: {
      identityId: 'identity-1',
      batchId: 'batch-1',
      references,
    } satisfies PortableCapabilityExecutionContext,
    imported,
  };
}

describe('LabelPortableCapability', () => {
  it('exports owner facts only and declares capability-scoped refs', async () => {
    const service = {
      listAll: vi
        .fn()
        .mockResolvedValue([label('label-a', 'Work', '#112233'), label('label-b', 'Health', null)]),
    } as unknown as LabelService;
    const capability = new LabelPortableCapability(service);
    const { context } = executionContext();

    const payload = await capability.export(context);

    expect(payload).toEqual({
      labels: [
        { ref: 'labels:1', name: 'Work', color: '#112233' },
        { ref: 'labels:2', name: 'Health', color: null },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain('identity-1');
    expect(JSON.stringify(payload)).not.toContain('label-a');
  });

  it('dry-runs created, updated and skipped labels without mutating', async () => {
    const service = {
      listAll: vi
        .fn()
        .mockResolvedValue([label('label-a', 'Work', '#112233'), label('label-b', 'Health', null)]),
      create: vi.fn(),
      update: vi.fn(),
    } as unknown as LabelService;
    const capability = new LabelPortableCapability(service);
    const { context, imported } = executionContext();

    const receipt = await capability.dryRun(
      {
        labels: [
          { ref: 'labels:1', name: 'Work', color: '#112233' },
          { ref: 'labels:2', name: 'Health', color: '#445566' },
          { ref: 'labels:3', name: 'Personal', color: null },
        ],
      },
      context,
    );

    expect(receipt).toEqual({ created: 1, updated: 1, skipped: 1, warnings: [] });
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
    expect(Object.fromEntries(imported)).toEqual({
      'labels:1': 'label-a',
      'labels:2': 'label-b',
      'labels:3': 'portable-label:labels:3',
    });
  });

  it('applies idempotently and binds imported refs to host-owned ids', async () => {
    const work = label('label-a', 'Work', '#112233');
    const health = label('label-b', 'Health', null);
    const updatedHealth = label('label-b', 'Health', '#445566');
    const personal = label('label-c', 'Personal', null);
    const service = {
      listAll: vi.fn().mockResolvedValue([work, health]),
      create: vi.fn().mockResolvedValue(personal),
      update: vi.fn().mockResolvedValue(updatedHealth),
    } as unknown as LabelService;
    const capability = new LabelPortableCapability(service);
    const { context, imported } = executionContext();

    const receipt = await capability.apply(
      {
        labels: [
          { ref: 'labels:1', name: 'Work', color: '#112233' },
          { ref: 'labels:2', name: 'Health', color: '#445566' },
          { ref: 'labels:3', name: 'Personal', color: null },
        ],
      },
      context,
    );

    expect(receipt).toEqual({ created: 1, updated: 1, skipped: 1, warnings: [] });
    expect(service.update).toHaveBeenCalledWith({
      identityId: 'identity-1',
      labelId: 'label-b',
      name: 'Health',
      color: '#445566',
    });
    expect(service.create).toHaveBeenCalledWith({
      identityId: 'identity-1',
      name: 'Personal',
      color: null,
    });
    expect(Object.fromEntries(imported)).toEqual({
      'labels:1': 'label-a',
      'labels:2': 'label-b',
      'labels:3': 'label-c',
    });
  });
});
