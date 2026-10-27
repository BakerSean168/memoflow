import { z } from 'zod';
import { PortableReferenceV3Schema } from '@memoflow/data-portability-contracts';
import { TimeZoneIdSchema, YmdSchema } from '@memoflow/shared-primitives';
import { ROUTINE_DESCRIPTION_MAX_LENGTH, ROUTINE_NAME_MAX_LENGTH } from './routine';
import { ROUTINE_INTERACTION_ACTIONS, ROUTINE_OCCURRENCE_RESOLUTION_KINDS, ROUTINE_OCCURRENCE_RESOLUTION_STATES, ROUTINE_OCCURRENCE_TRIGGER_KINDS } from './occurrence';

const RoutinePortableReferenceV3Schema = PortableReferenceV3Schema.refine(
  (ref) => ref.startsWith('routines:'),
  'Routine portable references must use the routines capability',
);
const PortableInstantSchema = z.number().int().nonnegative();
const HmSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/);
const RecurrenceFrequencySchema = z.enum(['daily', 'weekly', 'monthly', 'yearly']);
const WeekdaySchema = z.number().int().min(0).max(6);

const RoutineTriggerPortableSchema = z.union([
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
  z.union([
    z
      .object({
        type: z.literal('Elapsed'),
        timingOwner: z.literal('scheduler'),
        durationMs: z.number().finite().positive(),
        anchor: z.enum(['routine-activation', 'last-satisfied']),
      })
      .strict(),
    z
      .object({
        type: z.literal('Elapsed'),
        timingOwner: z.literal('local-runtime'),
        durationMs: z.number().finite().positive(),
        anchor: z.literal('profile-activation'),
      })
      .strict(),
  ]),
  z
    .object({
      type: z.literal('ActiveUsage'),
      timingOwner: z.literal('local-runtime'),
      requiredActiveMs: z.number().finite().positive(),
      anchor: z.enum(['profile-activation', 'last-satisfied']),
      naturalBreakCredit: z
        .object({
          idleDurationMs: z.number().finite().positive(),
          effect: z.literal('satisfy-and-reset'),
        })
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
    name: z.string().trim().min(1).max(ROUTINE_NAME_MAX_LENGTH),
    description: z.string().max(ROUTINE_DESCRIPTION_MAX_LENGTH).nullable(),
    enabled: z.boolean(),
    trigger: RoutineTriggerPortableSchema.nullable(),
    activatedAt: PortableInstantSchema.nullable().optional(),
  })
  .strict();

const RoutinePortableProfileSchema = z
  .object({
    ref: RoutinePortableReferenceV3Schema,
    name: z.string().trim().min(1).max(ROUTINE_NAME_MAX_LENGTH),
    description: z.string().max(ROUTINE_DESCRIPTION_MAX_LENGTH).nullable(),
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
    preferences: z
      .object({
        globalEnabled: z.boolean(),
      })
      .strict()
      .default({ globalEnabled: true }),
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
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `Duplicate Routine ref: ${ref}`,
        });
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

