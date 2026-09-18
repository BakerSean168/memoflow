import { createHash } from 'node:crypto';
import {
  SchedulePortablePayloadV3Schema,
  type SchedulePortablePayloadV3,
} from '@memoflow/contracts/schedule';
import type {
  PortableCapability,
  PortableCapabilityExecutionContext,
  PortableCapabilityReceipt,
  PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import type { CalendarEntry } from '../domain/aggregates/calendar-entry';
import { CalendarEntry as CalendarEntryEntity } from '../domain/aggregates/calendar-entry';
import { ScheduleId } from '../domain/value-objects/schedule-id';
import type { IScheduleRepository } from '../domain/repositories/i-schedule-repository';

function stableUuid(seed: string): string {
  const hex = createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function requireBatchId(context: PortableCapabilityExecutionContext): string {
  if (!context.batchId) throw new Error('schedules@3 requires a portability batch id');
  return context.batchId;
}

function deterministicScheduleId(
  context: PortableCapabilityExecutionContext,
  ref: PortableReferenceV3,
): string {
  return `IScheduleId_${stableUuid(
    `portable:${context.identityId}:${requireBatchId(context)}:schedule:${ref}`,
  )}`;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function portableSortKey(schedule: CalendarEntry): string {
  const projected = projectSchedule(schedule);
  return JSON.stringify([
    projected.title,
    projected.description,
    projected.range,
    projected.location,
    projected.attendees,
  ]);
}

function projectSchedule(schedule: CalendarEntry): SchedulePortablePayloadV3['entries'][number] {
  const dto = schedule.toServerDTO();
  return {
    ref: '' as PortableReferenceV3,
    title: dto.title,
    description: dto.description ?? null,
    range: dto.range,
    location: dto.location ?? null,
    attendees: dto.attendees ?? null,
  };
}

function assertScheduleMatches(
  schedule: CalendarEntry,
  incoming: SchedulePortablePayloadV3['entries'][number],
): void {
  const current = projectSchedule(schedule);
  if (
    current.title !== incoming.title ||
    current.description !== incoming.description ||
    !same(current.range, incoming.range) ||
    current.location !== incoming.location ||
    !same(current.attendees, incoming.attendees)
  ) {
    throw new Error(`schedules@3 deterministic target conflicts with portable entry ${incoming.ref}`);
  }
}

/** Owner-owned V3 capability for canonical Planner/Calendar entries. */
export class SchedulePortableCapability implements PortableCapability<SchedulePortablePayloadV3> {
  readonly key = 'schedules' as const;
  readonly schemaVersion = 3;
  readonly dependsOn = [] as const;
  readonly payloadSchema = SchedulePortablePayloadV3Schema;

  constructor(private readonly repository: IScheduleRepository) {}

  async export(context: PortableCapabilityExecutionContext): Promise<SchedulePortablePayloadV3> {
    const entries = (await this.repository.findByIdentityId(context.identityId))
      .slice()
      .sort((a, b) => portableSortKey(a).localeCompare(portableSortKey(b)) || String(a.id).localeCompare(String(b.id)));
    return SchedulePortablePayloadV3Schema.parse({
      entries: entries.map((entry) => ({
        ...projectSchedule(entry),
        ref: context.references.declareExportReference(this.key, String(entry.id)),
      })),
    });
  }

  async validateImport(
    payload: SchedulePortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<void> {
    await this.dryRun(SchedulePortablePayloadV3Schema.parse(payload), context);
  }

  async dryRun(
    payload: SchedulePortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const target = SchedulePortablePayloadV3Schema.parse(payload);
    let created = 0;
    let skipped = 0;
    for (const entry of target.entries) {
      const id = deterministicScheduleId(context, entry.ref);
      const current = await this.repository.findByIdForIdentity(context.identityId, id);
      if (current) {
        assertScheduleMatches(current, entry);
        skipped += 1;
      } else {
        created += 1;
      }
      context.references.bindImportedReference(entry.ref, id);
    }
    return {
      created,
      updated: 0,
      skipped,
      warnings: ['Planner occupancy and conflict projections are derived and are not portable.'],
    };
  }

  async apply(
    payload: SchedulePortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const target = SchedulePortablePayloadV3Schema.parse(payload);
    let created = 0;
    let skipped = 0;
    const now = new Date();
    for (const entry of target.entries) {
      const id = deterministicScheduleId(context, entry.ref);
      const current = await this.repository.findByIdForIdentity(context.identityId, id);
      if (current) {
        assertScheduleMatches(current, entry);
        skipped += 1;
      } else {
        const schedule = CalendarEntryEntity.load({
          id: ScheduleId.of(id),
          identityId: context.identityId as never,
          title: entry.title,
          description: entry.description,
          range: entry.range,
          location: entry.location,
          attendees: entry.attendees,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        await this.repository.save(schedule);
        created += 1;
      }
      context.references.bindImportedReference(entry.ref, id);
    }
    return {
      created,
      updated: 0,
      skipped,
      warnings: ['Planner occupancy and conflict projections are derived and are not portable.'],
    };
  }
}

export function createSchedulePortableCapability(
  repository: IScheduleRepository,
): SchedulePortableCapability {
  return new SchedulePortableCapability(repository);
}
