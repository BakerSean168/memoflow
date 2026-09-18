import { describe, expect, it, vi } from 'vitest';
import {
  type PortableCapabilityExecutionContext,
  type PortableReferencePort,
  type PortableReferenceV3,
  PortableReferenceV3Schema,
} from '@memoflow/contracts/data-portability';
import { CalendarEntry } from '../domain/aggregates/calendar-entry';
import type { IScheduleRepository } from '../domain/repositories/i-schedule-repository';
import { SchedulePortableCapability } from './schedule-portability';

class FakeReferences implements PortableReferencePort {
  private next = 0;
  private readonly imports = new Map<PortableReferenceV3, string>();

  declareExportReference(capabilityKey: string, _sourceKey: string): PortableReferenceV3 {
    this.next += 1;
    return PortableReferenceV3Schema.parse(`${capabilityKey}:${this.next}`);
  }

  resolveExportReference(): PortableReferenceV3 {
    throw new Error('not used by schedules');
  }

  bindImportedReference(portableRef: PortableReferenceV3, targetKey: string): void {
    this.imports.set(portableRef, targetKey);
  }

  resolveImportedReference(portableRef: PortableReferenceV3): string {
    const value = this.imports.get(portableRef);
    if (!value) throw new Error(`missing import reference ${portableRef}`);
    return value;
  }
}

function context(references: PortableReferencePort): PortableCapabilityExecutionContext {
  return { identityId: 'identity-schedule', batchId: 'batch-schedule-v3', references };
}

function makeRepository(initial: CalendarEntry[] = []) {
  let entries = [...initial];
  const repository = {
    findByIdentityId: vi.fn(async (identityId: string) =>
      entries.filter((entry) => String(entry.identityId) === identityId),
    ),
    findByIdForIdentity: vi.fn(async (identityId: string, id: string) =>
      entries.find((entry) => String(entry.identityId) === identityId && String(entry.id) === id) ?? null,
    ),
    save: vi.fn(async (entry: CalendarEntry) => {
      entries = [...entries.filter((current) => String(current.id) !== String(entry.id)), entry];
    }),
  } as unknown as IScheduleRepository;
  return {
    repository,
    get entries() {
      return entries;
    },
  };
}

function sourceEntries(): CalendarEntry[] {
  return [
    CalendarEntry.create({
      identityId: 'identity-schedule' as never,
      title: 'Planning',
      description: 'Timed fact',
      range: { kind: 'Timed', start: 1_758_000_000_000, end: 1_758_000_360_000 },
      location: 'Desk',
      attendees: ['a@example.test'],
    }),
    CalendarEntry.create({
      identityId: 'identity-schedule' as never,
      title: 'Holiday',
      description: null,
      range: { kind: 'AllDay', start: '2026-09-18', end: null },
      location: null,
      attendees: null,
    }),
  ];
}

describe('SchedulePortableCapability', () => {
  it('round-trips canonical CalendarEntry facts and excludes derived/ops state', async () => {
    const source = makeRepository(sourceEntries());
    const capability = new SchedulePortableCapability(source.repository);
    const payload = await capability.export(context(new FakeReferences()));

    expect(payload.entries).toHaveLength(2);
    expect(payload.entries.map((entry) => entry.range.kind)).toEqual(['AllDay', 'Timed']);
    expect(payload).not.toHaveProperty('occupancy');
    expect(payload.entries[0]).not.toHaveProperty('version');
    expect(payload.entries[0]).not.toHaveProperty('invocationAttempts');

    const target = makeRepository();
    const targetCapability = new SchedulePortableCapability(target.repository);
    await expect(targetCapability.dryRun(payload, context(new FakeReferences()))).resolves.toMatchObject({
      created: 2,
      updated: 0,
      skipped: 0,
    });
    await targetCapability.apply(payload, context(new FakeReferences()));
    const roundTripped = await targetCapability.export(context(new FakeReferences()));
    expect(roundTripped).toEqual(payload);
  });

  it('fails closed for a reference owned by another capability', async () => {
    const repository = makeRepository();
    const capability = new SchedulePortableCapability(repository.repository);
    const invalid = {
      entries: [
        {
          ref: 'tasks:1',
          title: 'Foreign',
          description: null,
          range: { kind: 'Timed', start: 1, end: 2 },
          location: null,
          attendees: null,
        },
      ],
    };
    await expect(
      capability.dryRun(invalid as never, context(new FakeReferences())),
    ).rejects.toThrow('schedules');
  });
});
