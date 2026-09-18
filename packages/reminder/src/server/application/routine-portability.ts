import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  PortableReferenceV3Schema,
  type PortableCapability,
  type PortableCapabilityExecutionContext,
  type PortableCapabilityReceipt,
  type PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import { TimeZoneIdSchema, YmdSchema } from '@memoflow/contracts/primitives';
import type {
  ProfileMembership,
  RoutineDefinition,
  RoutineProfile,
  RoutineTemporaryOverride,
  RoutineTrigger,
} from '../domain/routine';
import {
  ProfileMembership as ProfileMembershipEntity,
  RoutineDefinition as RoutineDefinitionEntity,
  RoutineProfile as RoutineProfileEntity,
  createTemporaryOverride,
} from '../domain/routine';
import {
  ROUTINE_INTERACTION_ACTIONS,
  ROUTINE_OCCURRENCE_RESOLUTION_KINDS,
  ROUTINE_OCCURRENCE_RESOLUTION_STATES,
  ROUTINE_OCCURRENCE_TRIGGER_KINDS,
  type RoutineOccurrenceFact,
  type RoutineOccurrenceTruthStore,
  type RoutineProfileStore,
  type RoutineTemporaryOverrideStore,
} from '../domain/ports';

const RoutinePortableReferenceV3Schema = PortableReferenceV3Schema.refine(
  (ref) => ref.startsWith('routines:'),
  'Routine portable references must use the routines capability',
);
const PortableInstantSchema = z.number().int().nonnegative();
const HmSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/);
const RecurrenceFrequencySchema = z.enum(['daily', 'weekly', 'monthly', 'yearly']);
const WeekdaySchema = z.number().int().min(0).max(6);

const RoutineTriggerPortableSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('WallClock'),
      timingOwner: z.literal('scheduler'),
      localTime: HmSchema,
      timeZone: TimeZoneIdSchema,
      recurrence: z
        .object({
          startDate: YmdSchema,
          frequency: RecurrenceFrequencySchema,
          interval: z.number().int().positive(),
          byWeekday: z.array(WeekdaySchema),
          count: z.number().int().positive().nullable(),
          until: PortableInstantSchema.nullable(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('Elapsed'),
      timingOwner: z.literal('local-runtime'),
      durationMs: z.number().finite().positive(),
      anchor: z.enum(['routine-activation', 'profile-activation', 'last-satisfied']),
    })
    .strict(),
  z
    .object({
      type: z.literal('ActiveUsage'),
      timingOwner: z.literal('local-runtime'),
      requiredActiveMs: z.number().finite().positive(),
      anchor: z.enum(['profile-activation', 'last-satisfied']),
      naturalBreakCredit: z
        .object({ idleDurationMs: z.number().finite().positive(), effect: z.literal('satisfy-and-reset') })
        .strict()
        .nullable(),
      protocolBreakCredit: z
        .object({
          kind: z.enum(['Stand', 'Eye', 'Movement']),
          minimumBreakMs: z.number().finite().positive(),
        })
        .strict()
        .nullable(),
    })
    .strict(),
]);

const RoutineTemporaryOverridePortableSchema = z
  .object({
    routineRef: RoutinePortableReferenceV3Schema,
    snoozeUntil: PortableInstantSchema.nullable(),
    suppressUntil: PortableInstantSchema.nullable(),
    overrideIntervalMs: z.number().finite().positive().nullable(),
    expiresAt: PortableInstantSchema,
    reason: z.string().trim().min(1).max(1000),
    source: z.enum(['user', 'ai', 'runtime']),
  })
  .strict()
  .superRefine((override, ctx) => {
    if (
      override.snoozeUntil === null &&
      override.suppressUntil === null &&
      override.overrideIntervalMs === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['overrideIntervalMs'],
        message: 'Routine overrides must define at least one temporary effect',
      });
    }
    if (override.snoozeUntil !== null && override.snoozeUntil > override.expiresAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['snoozeUntil'],
        message: 'Routine snoozeUntil must not exceed expiresAt',
      });
    }
    if (override.suppressUntil !== null && override.suppressUntil > override.expiresAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['suppressUntil'],
        message: 'Routine suppressUntil must not exceed expiresAt',
      });
    }
  });

const RoutinePortableDefinitionSchema = z
  .object({
    ref: RoutinePortableReferenceV3Schema,
    name: z.string().trim().min(1).max(200),
    description: z.string().nullable(),
    enabled: z.boolean(),
    trigger: RoutineTriggerPortableSchema.nullable(),
  })
  .strict();

const RoutinePortableProfileSchema = z
  .object({
    ref: RoutinePortableReferenceV3Schema,
    name: z.string().trim().min(1).max(200),
    description: z.string().nullable(),
    enabled: z.boolean(),
  })
  .strict();

const RoutinePortableMembershipSchema = z
  .object({
    routineRef: RoutinePortableReferenceV3Schema,
    profileRef: RoutinePortableReferenceV3Schema,
    enabled: z.boolean(),
  })
  .strict();

const RoutinePortableOccurrenceSchema = z
  .object({
    ref: RoutinePortableReferenceV3Schema,
    routineRef: RoutinePortableReferenceV3Schema,
    occurrenceKey: z.string().trim().min(1).max(500),
    triggerKind: z.enum(ROUTINE_OCCURRENCE_TRIGGER_KINDS),
    scheduledFor: PortableInstantSchema.nullable(),
    becameDueAt: PortableInstantSchema,
    resolutionState: z.enum(ROUTINE_OCCURRENCE_RESOLUTION_STATES),
    resolvedAt: PortableInstantSchema.nullable(),
    resolutionKind: z.enum(ROUTINE_OCCURRENCE_RESOLUTION_KINDS).nullable(),
    resolutionReason: z.string().nullable(),
  })
  .strict()
  .superRefine((occurrence, ctx) => {
    if (occurrence.resolutionState === 'Open') {
      if (
        occurrence.resolvedAt !== null ||
        occurrence.resolutionKind !== null ||
        occurrence.resolutionReason !== null
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['resolutionState'],
          message: 'Open Routine occurrences cannot carry resolution fields',
        });
      }
      return;
    }
    if (occurrence.resolvedAt === null || occurrence.resolutionKind === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolvedAt'],
        message: 'Resolved Routine occurrences require resolution fields',
      });
    }
  });

const RoutinePortableInteractionSchema = z
  .object({
    ref: RoutinePortableReferenceV3Schema,
    occurrenceRef: RoutinePortableReferenceV3Schema,
    action: z.enum(ROUTINE_INTERACTION_ACTIONS),
    actedAt: PortableInstantSchema,
    responseLatencyMs: z.number().finite().nonnegative().nullable(),
    snoozeDurationMs: z.number().finite().positive().nullable(),
  })
  .strict();

export const RoutinePortablePayloadV3Schema = z
  .object({
    definitions: z.array(RoutinePortableDefinitionSchema),
    profiles: z.array(RoutinePortableProfileSchema),
    memberships: z.array(RoutinePortableMembershipSchema),
    overrides: z.array(RoutineTemporaryOverridePortableSchema),
    occurrences: z.array(RoutinePortableOccurrenceSchema),
    interactions: z.array(RoutinePortableInteractionSchema),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const refs = new Set<string>();
    const addRef = (ref: string, path: (string | number)[]) => {
      if (refs.has(ref)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `Duplicate Routine ref: ${ref}` });
      }
      refs.add(ref);
    };
    const definitionRefs = new Set(payload.definitions.map((item) => item.ref));
    const profileRefs = new Set(payload.profiles.map((item) => item.ref));
    const occurrenceRefs = new Set(payload.occurrences.map((item) => item.ref));
    const occurrencesByRef = new Map(payload.occurrences.map((item) => [item.ref, item]));
    const occurrenceKeys = new Set<string>();
    const membershipKeys = new Set<string>();
    const overrideRoutineRefs = new Set<string>();

    payload.definitions.forEach((item, index) => addRef(item.ref, ['definitions', index, 'ref']));
    payload.profiles.forEach((item, index) => addRef(item.ref, ['profiles', index, 'ref']));
    payload.occurrences.forEach((item, index) => {
      addRef(item.ref, ['occurrences', index, 'ref']);
      if (!definitionRefs.has(item.routineRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['occurrences', index, 'routineRef'],
          message: `Routine occurrence references an unknown definition: ${item.routineRef}`,
        });
      }
      const key = `${item.routineRef}\u0000${item.occurrenceKey}`;
      if (occurrenceKeys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['occurrences', index, 'occurrenceKey'],
          message: `Duplicate Routine occurrence key: ${item.occurrenceKey}`,
        });
      }
      occurrenceKeys.add(key);
    });
    payload.memberships.forEach((item, index) => {
      if (!definitionRefs.has(item.routineRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['memberships', index, 'routineRef'],
          message: `Routine membership references an unknown definition: ${item.routineRef}`,
        });
      }
      if (!profileRefs.has(item.profileRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['memberships', index, 'profileRef'],
          message: `Routine membership references an unknown profile: ${item.profileRef}`,
        });
      }
      const membershipKey = `${item.routineRef}\u0000${item.profileRef}`;
      if (membershipKeys.has(membershipKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['memberships', index],
          message: `Duplicate Routine membership: ${item.routineRef} -> ${item.profileRef}`,
        });
      }
      membershipKeys.add(membershipKey);
    });
    payload.overrides.forEach((item, index) => {
      if (!definitionRefs.has(item.routineRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['overrides', index, 'routineRef'],
          message: `Routine override references an unknown definition: ${item.routineRef}`,
        });
      }
      if (overrideRoutineRefs.has(item.routineRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['overrides', index, 'routineRef'],
          message: `Duplicate Routine override: ${item.routineRef}`,
        });
      }
      overrideRoutineRefs.add(item.routineRef);
    });
    payload.interactions.forEach((item, index) => {
      addRef(item.ref, ['interactions', index, 'ref']);
      const occurrence = occurrencesByRef.get(item.occurrenceRef);
      if (!occurrenceRefs.has(item.occurrenceRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['interactions', index, 'occurrenceRef'],
          message: `Routine interaction references an unknown occurrence: ${item.occurrenceRef}`,
        });
      }
      if (item.action === 'Snoozed' && item.snoozeDurationMs === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['interactions', index, 'snoozeDurationMs'],
          message: 'Snoozed Routine interactions require snoozeDurationMs',
        });
      }
      if (item.action !== 'Snoozed' && item.snoozeDurationMs !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['interactions', index, 'snoozeDurationMs'],
          message: 'Only Snoozed Routine interactions may carry snoozeDurationMs',
        });
      }
      if (
        item.action === 'Snoozed' &&
        occurrence &&
        !overrideRoutineRefs.has(occurrence.routineRef)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['interactions', index, 'action'],
          message: 'Snoozed Routine interactions require a portable override for their routine',
        });
      }
    });
  });

export type RoutinePortablePayloadV3 = z.infer<typeof RoutinePortablePayloadV3Schema>;

function stableUuid(seed: string): string {
  const hex = createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function targetId(context: PortableCapabilityExecutionContext, ref: PortableReferenceV3, kind: string): string {
  if (!context.batchId) throw new Error('routines@3 requires a portability batch id');
  return `portable-${kind}-${stableUuid(`portable:${context.identityId}:${context.batchId}:routine:${kind}:${ref}`)}`;
}

function requireBatchId(context: PortableCapabilityExecutionContext): string {
  if (!context.batchId) throw new Error('routines@3 requires a portability batch id');
  return context.batchId;
}

function occurrenceKey(routineId: string, key: string): string {
  return `${routineId}\u0000${key}`;
}

function portableTrigger(trigger: RoutineTrigger | null): RoutinePortablePayloadV3['definitions'][number]['trigger'] {
  if (!trigger) return null;
  return JSON.parse(JSON.stringify(trigger)) as RoutinePortablePayloadV3['definitions'][number]['trigger'];
}

function portableDefinitionSortKey(definition: RoutineDefinition): string {
  return JSON.stringify([
    definition.name,
    definition.description,
    definition.enabled,
    portableTrigger(definition.trigger),
  ]);
}

function portableProfileSortKey(profile: RoutineProfile): string {
  return JSON.stringify([profile.name, profile.description, profile.enabled]);
}

function portableOccurrenceSortKey(
  occurrence: RoutineOccurrenceFact,
  routineRef: PortableReferenceV3,
): string {
  return JSON.stringify([
    routineRef,
    occurrence.occurrenceKey,
    occurrence.triggerKind,
    occurrence.scheduledFor == null ? null : Number(occurrence.scheduledFor),
    Number(occurrence.becameDueAt),
    occurrence.resolutionState,
    occurrence.resolvedAt == null ? null : Number(occurrence.resolvedAt),
    occurrence.resolutionKind,
    occurrence.resolutionReason,
  ]);
}

function portableOverride(
  routineRef: PortableReferenceV3,
  override: RoutineTemporaryOverride,
): RoutinePortablePayloadV3['overrides'][number] {
  return {
    routineRef,
    snoozeUntil: override.snoozeUntil == null ? null : Number(override.snoozeUntil),
    suppressUntil: override.suppressUntil == null ? null : Number(override.suppressUntil),
    overrideIntervalMs: override.overrideIntervalMs,
    expiresAt: Number(override.expiresAt),
    reason: override.reason,
    source: override.source,
  };
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertDefinitionMatches(definition: RoutineDefinition, incoming: RoutinePortablePayloadV3['definitions'][number]): void {
  if (
    definition.name !== incoming.name ||
    definition.description !== incoming.description ||
    definition.enabled !== incoming.enabled ||
    !same(portableTrigger(definition.trigger), incoming.trigger)
  ) {
    throw new Error(`routines@3 deterministic target conflicts with portable definition ${incoming.ref}`);
  }
}

function assertProfileMatches(profile: RoutineProfile, incoming: RoutinePortablePayloadV3['profiles'][number]): void {
  if (
    profile.name !== incoming.name ||
    profile.description !== incoming.description ||
    profile.enabled !== incoming.enabled
  ) {
    throw new Error(`routines@3 deterministic target conflicts with portable profile ${incoming.ref}`);
  }
}

function assertOccurrenceIdentityMatches(
  current: RoutineOccurrenceFact,
  incoming: RoutinePortablePayloadV3['occurrences'][number],
): void {
  if (
    current.occurrenceKey !== incoming.occurrenceKey ||
    current.triggerKind !== incoming.triggerKind ||
    (current.scheduledFor == null ? null : Number(current.scheduledFor)) !== incoming.scheduledFor ||
    Number(current.becameDueAt) !== incoming.becameDueAt
  ) {
    throw new Error(`routines@3 occurrence target conflicts with portable occurrence ${incoming.ref}`);
  }
}

function assertOccurrenceCanConverge(
  current: RoutineOccurrenceFact,
  incoming: RoutinePortablePayloadV3['occurrences'][number],
): 'same' | 'resolve' {
  assertOccurrenceIdentityMatches(current, incoming);
  if (
    current.resolutionState === incoming.resolutionState &&
    (current.resolvedAt == null ? null : Number(current.resolvedAt)) === incoming.resolvedAt &&
    current.resolutionKind === incoming.resolutionKind &&
    current.resolutionReason === incoming.resolutionReason
  ) {
    return 'same';
  }
  if (current.resolutionState === 'Open' && incoming.resolutionState !== 'Open') {
    return 'resolve';
  }
  throw new Error(`routines@3 occurrence target conflicts with portable occurrence ${incoming.ref}`);
}

function interactionInput(
  context: PortableCapabilityExecutionContext,
  ref: PortableReferenceV3,
): string {
  return `portable:${context.identityId}:${requireBatchId(context)}:routine-interaction:${ref}`;
}

function toDomainOverride(
  override: RoutinePortablePayloadV3['overrides'][number],
): RoutineTemporaryOverride {
  return createTemporaryOverride({
    snoozeUntil: override.snoozeUntil,
    suppressUntil: override.suppressUntil,
    overrideIntervalMs: override.overrideIntervalMs,
    expiresAt: override.expiresAt,
    reason: override.reason,
    source: override.source,
  });
}

function membershipSnapshot(membership: ProfileMembership) {
  return {
    profileId: membership.profileId,
    routineId: membership.routineId,
    enabled: membership.enabled,
  };
}

/** Owner-owned V3 capability for durable Routine product facts. */
export class RoutinePortableCapability implements PortableCapability<RoutinePortablePayloadV3> {
  readonly key = 'routines' as const;
  readonly schemaVersion = 3;
  readonly dependsOn = [] as const;
  readonly payloadSchema = RoutinePortablePayloadV3Schema;

  constructor(
    private readonly profileStore: RoutineProfileStore,
    private readonly overrideStore: RoutineTemporaryOverrideStore,
    private readonly occurrenceStore: RoutineOccurrenceTruthStore,
  ) {}

  async export(context: PortableCapabilityExecutionContext): Promise<RoutinePortablePayloadV3> {
    const definitions = (await this.profileStore.listDefinitions({ identityId: context.identityId }))
      .slice()
      .sort((a, b) => portableDefinitionSortKey(a).localeCompare(portableDefinitionSortKey(b)));
    const profiles = (await this.profileStore.listProfiles({ identityId: context.identityId }))
      .slice()
      .sort((a, b) => portableProfileSortKey(a).localeCompare(portableProfileSortKey(b)));
    const definitionRefs = new Map(definitions.map((definition) => [definition.id, context.references.declareExportReference(this.key, definition.id)]));
    const profileRefs = new Map(profiles.map((profile) => [profile.id, context.references.declareExportReference(this.key, profile.id)]));
    const routineIds = definitions.map((definition) => definition.id);
    const memberships = await this.profileStore.listMembershipsForRoutines({
      identityId: context.identityId,
      routineIds,
    });

    const occurrences = (await this.occurrenceStore.listOccurrences({ identityId: context.identityId }))
      .slice()
      .sort((a, b) => {
        const leftRef = definitionRefs.get(a.routineId);
        const rightRef = definitionRefs.get(b.routineId);
        if (!leftRef || !rightRef) return a.routineId.localeCompare(b.routineId);
        return portableOccurrenceSortKey(a, leftRef).localeCompare(portableOccurrenceSortKey(b, rightRef));
      });
    const occurrenceRefs = new Map<string, PortableReferenceV3>();
    const portableOccurrences = occurrences.map((occurrence) => {
      const routineRef = definitionRefs.get(occurrence.routineId);
      if (!routineRef) throw new Error(`routines@3 occurrence has unknown routine owner: ${occurrence.routineId}`);
      const ref = context.references.declareExportReference(this.key, occurrence.id);
      occurrenceRefs.set(occurrenceKey(occurrence.routineId, occurrence.occurrenceKey), ref);
      return {
        ref,
        routineRef,
        occurrenceKey: occurrence.occurrenceKey,
        triggerKind: occurrence.triggerKind,
        scheduledFor: occurrence.scheduledFor == null ? null : Number(occurrence.scheduledFor),
        becameDueAt: Number(occurrence.becameDueAt),
        resolutionState: occurrence.resolutionState,
        resolvedAt: occurrence.resolvedAt == null ? null : Number(occurrence.resolvedAt),
        resolutionKind: occurrence.resolutionKind,
        resolutionReason: occurrence.resolutionReason,
      };
    });

    const interactions = (await this.occurrenceStore.listInteractionsForIdentity({ identityId: context.identityId }))
      .slice()
      .sort((a, b) => {
        const leftOccurrenceRef = occurrenceRefs.get(occurrenceKey(a.routineId, a.occurrenceKey));
        const rightOccurrenceRef = occurrenceRefs.get(occurrenceKey(b.routineId, b.occurrenceKey));
        return JSON.stringify([
          leftOccurrenceRef ?? '',
          a.action,
          Number(a.actedAt),
          a.responseLatencyMs,
          a.snoozeDurationMs,
        ]).localeCompare(
          JSON.stringify([
            rightOccurrenceRef ?? '',
            b.action,
            Number(b.actedAt),
            b.responseLatencyMs,
            b.snoozeDurationMs,
          ]),
        );
      });
    const portableInteractions = interactions.map((interaction) => {
      const occurrenceRef = occurrenceRefs.get(occurrenceKey(interaction.routineId, interaction.occurrenceKey));
      if (!occurrenceRef) {
        throw new Error(
          `routines@3 interaction has unknown occurrence owner: ${interaction.routineId}:${interaction.occurrenceKey}`,
        );
      }
      return {
        ref: context.references.declareExportReference(this.key, interaction.id),
        occurrenceRef,
        action: interaction.action,
        actedAt: Number(interaction.actedAt),
        responseLatencyMs: interaction.responseLatencyMs,
        snoozeDurationMs: interaction.snoozeDurationMs,
      };
    });

    const overrides: RoutinePortablePayloadV3['overrides'] = [];
    for (const definition of definitions) {
      const override = await this.overrideStore.findRoutineTemporaryOverride({
        identityId: context.identityId,
        routineId: definition.id,
      });
      if (override) {
        const routineRef = definitionRefs.get(definition.id);
        if (!routineRef) throw new Error(`routines@3 missing routine reference: ${definition.id}`);
        overrides.push(portableOverride(routineRef, override));
      }
    }

    return RoutinePortablePayloadV3Schema.parse({
      definitions: definitions.map((definition) => ({
        ref: definitionRefs.get(definition.id),
        name: definition.name,
        description: definition.description,
        enabled: definition.enabled,
        trigger: portableTrigger(definition.trigger),
      })),
      profiles: profiles.map((profile) => ({
        ref: profileRefs.get(profile.id),
        name: profile.name,
        description: profile.description,
        enabled: profile.enabled,
      })),
      memberships: memberships
        .slice()
        .sort((a, b) => {
          const leftRoutineRef = definitionRefs.get(a.routineId) ?? '';
          const rightRoutineRef = definitionRefs.get(b.routineId) ?? '';
          return (
            leftRoutineRef.localeCompare(rightRoutineRef) ||
            (profileRefs.get(a.profileId) ?? '').localeCompare(profileRefs.get(b.profileId) ?? '')
          );
        })
        .map((membership) => ({
          routineRef: definitionRefs.get(membership.routineId),
          profileRef: profileRefs.get(membership.profileId),
          enabled: membership.enabled,
        })),
      overrides,
      occurrences: portableOccurrences,
      interactions: portableInteractions,
    });
  }

  async validateImport(
    payload: RoutinePortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<void> {
    await this.dryRun(RoutinePortablePayloadV3Schema.parse(payload), context);
  }

  async dryRun(
    payload: RoutinePortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const target = RoutinePortablePayloadV3Schema.parse(payload);
    const definitionsByRef = new Map(target.definitions.map((item) => [item.ref, item]));
    const profilesByRef = new Map(target.profiles.map((item) => [item.ref, item]));
    const overridesByRoutineRef = new Map(target.overrides.map((item) => [item.routineRef, item]));
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const definition of target.definitions) {
      const id = targetId(context, definition.ref, 'definition');
      const current = await this.profileStore.findDefinition({ identityId: context.identityId, routineId: id });
      if (current) {
        assertDefinitionMatches(current, definition);
        skipped += 1;
      } else created += 1;
      context.references.bindImportedReference(definition.ref, id);
    }
    for (const profile of target.profiles) {
      const id = targetId(context, profile.ref, 'profile');
      const current = await this.profileStore.findProfile({ identityId: context.identityId, profileId: id });
      if (current) {
        assertProfileMatches(current, profile);
        skipped += 1;
      } else created += 1;
      context.references.bindImportedReference(profile.ref, id);
    }

    const memberships = await this.profileStore.listMembershipsForRoutines({
      identityId: context.identityId,
      routineIds: target.definitions.map((definition) => targetId(context, definition.ref, 'definition')),
    });
    const existingMemberships = new Map(
      memberships.map((membership) => [`${membership.routineId}\u0000${membership.profileId}`, membership]),
    );
    const desiredMembershipKeys = new Set<string>();
    for (const membership of target.memberships) {
      const routineId = context.references.resolveImportedReference(membership.routineRef);
      const profileId = context.references.resolveImportedReference(membership.profileRef);
      const key = `${routineId}\u0000${profileId}`;
      desiredMembershipKeys.add(key);
      const current = existingMemberships.get(key);
      if (!current) created += 1;
      else if (current.enabled === membership.enabled) skipped += 1;
      else updated += 1;
    }
    // A portable payload is a complete owner snapshot for the M:N edge set.
    for (const current of existingMemberships.values()) {
      if (!desiredMembershipKeys.has(`${current.routineId}\u0000${current.profileId}`)) updated += 1;
    }

    for (const definition of target.definitions) {
      const routineId = context.references.resolveImportedReference(definition.ref);
      const current = await this.overrideStore.findRoutineTemporaryOverride({
        identityId: context.identityId,
        routineId,
      });
      const incoming = overridesByRoutineRef.get(definition.ref);
      if (!current && incoming) created += 1;
      else if (current && !incoming) updated += 1;
      else if (current && incoming && !same(portableOverride(definition.ref, current), incoming)) updated += 1;
      else if (current && incoming) skipped += 1;
    }

    for (const occurrence of target.occurrences) {
      const routineId = context.references.resolveImportedReference(occurrence.routineRef);
      const current = await this.occurrenceStore.findOccurrence({
        identityId: context.identityId,
        routineId,
        occurrenceKey: occurrence.occurrenceKey,
      });
      if (current) {
        const convergence = assertOccurrenceCanConverge(current, occurrence);
        if (convergence === 'same') skipped += 1;
        else updated += 1;
      } else created += 1;
      context.references.bindImportedReference(
        occurrence.ref,
        `${routineId}\u0000${occurrence.occurrenceKey}`,
      );
    }

    const existingInteractions = await this.occurrenceStore.listInteractionsForIdentity({
      identityId: context.identityId,
    });
    const existingByKey = new Map(existingInteractions.map((interaction) => [interaction.idempotencyKey, interaction]));
    for (const interaction of target.interactions) {
      const occurrence = target.occurrences.find((candidate) => candidate.ref === interaction.occurrenceRef);
      if (!occurrence) {
        throw new Error(`routines@3 interaction references an unknown occurrence: ${interaction.occurrenceRef}`);
      }
      const routineId = context.references.resolveImportedReference(occurrence.routineRef);
      context.references.resolveImportedReference(interaction.occurrenceRef);
      const current = existingByKey.get(interactionInput(context, interaction.ref));
      if (current) {
        if (
          current.action !== interaction.action ||
          current.routineId !== routineId ||
          current.occurrenceKey !== occurrence.occurrenceKey ||
          Number(current.actedAt) !== interaction.actedAt ||
          current.responseLatencyMs !== interaction.responseLatencyMs ||
          current.snoozeDurationMs !== interaction.snoozeDurationMs
        ) {
          throw new Error(`routines@3 interaction target conflicts with portable interaction ${interaction.ref}`);
        }
        skipped += 1;
      } else created += 1;
      context.references.bindImportedReference(
        interaction.ref,
        `portable-interaction:${interaction.ref}`,
      );
    }

    // Keep these maps live in the validation path so a future schema extension
    // cannot silently bypass its owner-reference graph checks.
    if (definitionsByRef.size !== target.definitions.length || profilesByRef.size !== target.profiles.length) {
      throw new Error('routines@3 portable reference graph is not unique');
    }
    return { created, updated, skipped, warnings: ['RuntimeContext and scheduler reliability state are not portable.'] };
  }

  async apply(
    payload: RoutinePortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const target = RoutinePortablePayloadV3Schema.parse(payload);
    const now = new Date();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const overrideByRoutineRef = new Map(target.overrides.map((item) => [item.routineRef, item]));

    for (const definition of target.definitions) {
      const id = targetId(context, definition.ref, 'definition');
      const current = await this.profileStore.findDefinition({ identityId: context.identityId, routineId: id });
      if (current) {
        assertDefinitionMatches(current, definition);
        skipped += 1;
      } else {
        await this.profileStore.upsertDefinition(
          RoutineDefinitionEntity.create({
            id,
            identityId: context.identityId,
            name: definition.name,
            description: definition.description,
            enabled: definition.enabled,
            trigger: definition.trigger as RoutineTrigger | null,
            now,
          }),
        );
        created += 1;
      }
      context.references.bindImportedReference(definition.ref, id);
    }
    for (const profile of target.profiles) {
      const id = targetId(context, profile.ref, 'profile');
      const current = await this.profileStore.findProfile({ identityId: context.identityId, profileId: id });
      if (current) {
        assertProfileMatches(current, profile);
        skipped += 1;
      } else {
        await this.profileStore.upsertProfile(
          RoutineProfileEntity.create({
            id,
            identityId: context.identityId,
            name: profile.name,
            description: profile.description,
            enabled: profile.enabled,
            now,
          }),
        );
        created += 1;
      }
      context.references.bindImportedReference(profile.ref, id);
    }

    const routineRefs = target.definitions.map((definition) => definition.ref);
    const membershipsByRoutine = new Map<string, ProfileMembership[]>();
    for (const membership of target.memberships) {
      const routineId = context.references.resolveImportedReference(membership.routineRef);
      const profileId = context.references.resolveImportedReference(membership.profileRef);
      const list = membershipsByRoutine.get(membership.routineRef) ?? [];
      list.push(
        ProfileMembershipEntity.create({
          identityId: context.identityId,
          routineId,
          profileId,
          enabled: membership.enabled,
          now,
        }),
      );
      membershipsByRoutine.set(membership.routineRef, list);
    }
    const currentMemberships = await this.profileStore.listMembershipsForRoutines({
      identityId: context.identityId,
      routineIds: target.definitions.map((definition) => context.references.resolveImportedReference(definition.ref)),
    });
    const currentMembershipsByRoutine = new Map<string, ProfileMembership[]>();
    for (const membership of currentMemberships) {
      const list = currentMembershipsByRoutine.get(membership.routineId) ?? [];
      list.push(membership);
      currentMembershipsByRoutine.set(membership.routineId, list);
    }
    for (const routineRef of routineRefs) {
      const routineId = context.references.resolveImportedReference(routineRef);
      const desired = membershipsByRoutine.get(routineRef) ?? [];
      const current = currentMembershipsByRoutine.get(routineId) ?? [];
      const currentComparable = current.map(membershipSnapshot).sort((a, b) => a.profileId.localeCompare(b.profileId));
      const desiredComparable = desired.map(membershipSnapshot).sort((a, b) => a.profileId.localeCompare(b.profileId));
      if (same(currentComparable, desiredComparable)) {
        skipped += current.length > 0 || desired.length > 0 ? 1 : 0;
      } else {
        await this.profileStore.replaceRoutineMemberships({
          identityId: context.identityId,
          routineId,
          memberships: desired,
        });
        updated += 1;
      }
    }

    for (const definition of target.definitions) {
      const routineId = context.references.resolveImportedReference(definition.ref);
      const current = await this.overrideStore.findRoutineTemporaryOverride({
        identityId: context.identityId,
        routineId,
      });
      const incoming = overrideByRoutineRef.get(definition.ref);
      if (current && incoming && same(portableOverride(definition.ref, current), incoming)) {
        skipped += 1;
      } else if (incoming) {
        await this.overrideStore.setRoutineTemporaryOverride({
          identityId: context.identityId,
          routineId,
          override: toDomainOverride(incoming),
        });
        if (current) updated += 1;
        else created += 1;
      } else if (current) {
        await this.overrideStore.clearRoutineTemporaryOverride({ identityId: context.identityId, routineId });
        updated += 1;
      }
    }

    for (const occurrence of target.occurrences) {
      const routineId = context.references.resolveImportedReference(occurrence.routineRef);
      const current = await this.occurrenceStore.findOccurrence({
        identityId: context.identityId,
        routineId,
        occurrenceKey: occurrence.occurrenceKey,
      });
      let resulting = current;
      if (!resulting) {
        resulting = await this.occurrenceStore.ensureOpenOccurrence({
          identityId: context.identityId,
          routineId,
          occurrenceKey: occurrence.occurrenceKey,
          triggerKind: occurrence.triggerKind,
          scheduledFor: occurrence.scheduledFor,
          becameDueAt: occurrence.becameDueAt,
          sourceRevision: null,
        });
        created += 1;
      } else {
        const convergence = assertOccurrenceCanConverge(resulting, occurrence);
        if (convergence === 'same') skipped += 1;
      }
      if (occurrence.resolutionState !== 'Open' && resulting.resolutionState === 'Open') {
        resulting = await this.occurrenceStore.resolveOccurrence({
          identityId: context.identityId,
          routineId,
          occurrenceKey: occurrence.occurrenceKey,
          state: occurrence.resolutionState,
          resolutionKind: occurrence.resolutionKind!,
          resolvedAt: occurrence.resolvedAt!,
          reason: occurrence.resolutionReason,
        });
        updated += 1;
      }
      context.references.bindImportedReference(
        occurrence.ref,
        `${routineId}\u0000${occurrence.occurrenceKey}`,
      );
    }

    const existingInteractions = await this.occurrenceStore.listInteractionsForIdentity({
      identityId: context.identityId,
    });
    const existingByKey = new Map(existingInteractions.map((interaction) => [interaction.idempotencyKey, interaction]));
    for (const interaction of target.interactions) {
      const current = existingByKey.get(interactionInput(context, interaction.ref));
      const occurrence = target.occurrences.find((candidate) => candidate.ref === interaction.occurrenceRef);
      if (!occurrence) throw new Error(`routines@3 interaction references an unknown occurrence: ${interaction.occurrenceRef}`);
      const routineId = context.references.resolveImportedReference(occurrence.routineRef);
      context.references.resolveImportedReference(interaction.occurrenceRef);
      if (current) {
        if (
          current.action !== interaction.action ||
          current.routineId !== routineId ||
          current.occurrenceKey !== occurrence.occurrenceKey ||
          Number(current.actedAt) !== interaction.actedAt ||
          current.responseLatencyMs !== interaction.responseLatencyMs ||
          current.snoozeDurationMs !== interaction.snoozeDurationMs
        ) {
          throw new Error(`routines@3 interaction target conflicts with portable interaction ${interaction.ref}`);
        }
        skipped += 1;
        context.references.bindImportedReference(interaction.ref, current.id);
        continue;
      }
      const override = overrideByRoutineRef.get(occurrence.routineRef);
      if (interaction.action === 'Snoozed' && !override) {
        throw new Error(`routines@3 Snoozed interaction requires a portable override: ${interaction.ref}`);
      }
      const receipt = await this.occurrenceStore.applyInteraction({
        idempotencyKey: interactionInput(context, interaction.ref),
        identityId: context.identityId,
        routineId,
        occurrenceKey: occurrence.occurrenceKey,
        action: interaction.action,
        actedAt: interaction.actedAt,
        responseLatencyMs: interaction.responseLatencyMs,
        snoozeDurationMs: interaction.snoozeDurationMs,
        temporaryOverride: override ? toDomainOverride(override) : null,
        metadata: null,
      });
      created += receipt.replayed ? 0 : 1;
      context.references.bindImportedReference(interaction.ref, receipt.interaction.id);
    }

    return {
      created,
      updated,
      skipped,
      warnings: ['RuntimeContext and scheduler reliability state are not portable.'],
    };
  }
}

export function createRoutinePortableCapability(repositories: {
  readonly routineProfileStore: RoutineProfileStore;
  readonly routineTemporaryOverrideStore: RoutineTemporaryOverrideStore;
  readonly routineOccurrenceTruthStore: RoutineOccurrenceTruthStore;
}): RoutinePortableCapability {
  return new RoutinePortableCapability(
    repositories.routineProfileStore,
    repositories.routineTemporaryOverrideStore,
    repositories.routineOccurrenceTruthStore,
  );
}
