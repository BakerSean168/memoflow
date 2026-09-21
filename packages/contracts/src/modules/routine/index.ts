import { z } from 'zod';
import { TimeZoneIdSchema, YmdSchema } from '../../primitives';

const HmSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/);
const PositiveMsSchema = z.number().finite().positive();

export const RoutineWallClockTriggerSchema = z.object({
  type: z.literal('WallClock'),
  timingOwner: z.literal('scheduler'),
  localTime: HmSchema,
  timeZone: TimeZoneIdSchema,
  recurrence: z.object({
    startDate: YmdSchema,
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    interval: z.number().int().positive(),
    byWeekday: z.array(z.number().int().min(0).max(6)),
    count: z.number().int().positive().nullable(),
    until: z.number().finite().nonnegative().nullable(),
  }),
});

export const RoutineElapsedTriggerSchema = z.object({
  type: z.literal('Elapsed'),
  timingOwner: z.literal('local-runtime'),
  durationMs: PositiveMsSchema,
  anchor: z.enum(['routine-activation', 'profile-activation', 'last-satisfied']),
});

export const RoutineActiveUsageTriggerSchema = z.object({
  type: z.literal('ActiveUsage'),
  timingOwner: z.literal('local-runtime'),
  requiredActiveMs: PositiveMsSchema,
  anchor: z.enum(['profile-activation', 'last-satisfied']),
  naturalBreakCredit: z
    .object({
      idleDurationMs: PositiveMsSchema,
      effect: z.literal('satisfy-and-reset'),
    })
    .nullable(),
  protocolBreakCredit: z
    .object({
      kind: z.enum(['Stand', 'Eye', 'Movement']),
      minimumBreakMs: PositiveMsSchema,
    })
    .nullable(),
});

export const RoutineTriggerSchema = z.discriminatedUnion('type', [
  RoutineWallClockTriggerSchema,
  RoutineElapsedTriggerSchema,
  RoutineActiveUsageTriggerSchema,
]);

export const RoutineDefinitionSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  description: z.string().nullable(),
  enabled: z.boolean(),
  trigger: RoutineTriggerSchema.nullable(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const RoutineProfileSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  description: z.string().nullable(),
  enabled: z.boolean(),
  active: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const RoutineMembershipSchema = z.object({
  routineId: z.string().trim().min(1),
  profileId: z.string().trim().min(1),
  enabled: z.boolean(),
  version: z.number().int().positive(),
});

export const RoutineTemporaryOverrideSchema = z.object({
  routineId: z.string().trim().min(1),
  snoozeUntil: z.number().finite().nonnegative().nullable(),
  suppressUntil: z.number().finite().nonnegative().nullable(),
  overrideIntervalMs: PositiveMsSchema.nullable(),
  expiresAt: z.number().finite().nonnegative(),
  reason: z.string().trim().min(1),
  source: z.enum(['user', 'ai', 'runtime']),
});

export const RoutineRuntimeContextSchema = z.object({
  activeProfileIds: z.array(z.string().trim().min(1)),
});

export const RoutineConfigurationSnapshotSchema = z.object({
  definitions: z.array(RoutineDefinitionSchema),
  profiles: z.array(RoutineProfileSchema),
  memberships: z.array(RoutineMembershipSchema),
  runtimeContext: RoutineRuntimeContextSchema,
  capabilities: z.object({
    localRuntime: z.boolean(),
  }),
  overrides: z.array(RoutineTemporaryOverrideSchema),
});

export const RoutineUpcomingQuerySchema = z
  .object({
    start: z.number().finite().nonnegative(),
    end: z.number().finite().nonnegative(),
    limit: z.number().int().positive().max(500).default(200),
  })
  .refine((value) => value.end >= value.start, {
    message: 'Routine upcoming range end must be greater than or equal to start',
    path: ['end'],
  });

export const RoutineUpcomingOccurrenceSchema = z.object({
  identityId: z.string().trim().min(1),
  routineId: z.string().trim().min(1),
  occurrenceKey: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().nullable(),
  occurrenceAt: z.number().finite().nonnegative(),
  endAt: z.number().finite().nonnegative().nullable(),
  revision: z.number().int().positive(),
  editable: z.literal(false),
});

export const RoutineUpcomingResponseSchema = z.object({
  occurrences: z.array(RoutineUpcomingOccurrenceSchema),
});

export const CreateRoutineRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().nullable().optional(),
  trigger: RoutineTriggerSchema.nullable().optional(),
  profileIds: z.array(z.string().trim().min(1)).default([]),
});

export const UpdateRoutineRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
    trigger: RoutineTriggerSchema.nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.enabled !== undefined ||
      value.trigger !== undefined,
    { message: 'At least one Routine field must be updated' },
  );

export const DeleteRoutineRequestSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
});

export const CreateRoutineProfileRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

export const UpdateRoutineProfileRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.description !== undefined || value.enabled !== undefined,
    { message: 'At least one Routine profile field must be updated' },
  );

export const DeleteRoutineProfileRequestSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
});

export const ReplaceRoutineProfilesRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  profileIds: z.array(z.string().trim().min(1)),
});

export const SetRoutineMembershipEnabledRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  enabled: z.boolean(),
});

export const SetRoutineProfileActiveRequestSchema = z.object({
  active: z.boolean(),
});

export const SetRoutineTemporaryOverrideRequestSchema = z
  .object({
    snoozeUntil: z.number().finite().nonnegative().nullable().optional(),
    suppressUntil: z.number().finite().nonnegative().nullable().optional(),
    overrideIntervalMs: PositiveMsSchema.nullable().optional(),
    expiresAt: z.number().finite().nonnegative(),
    reason: z.string().trim().min(1).max(1000),
    source: z.enum(['user', 'ai', 'runtime']).optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .refine(
    (value) =>
      value.snoozeUntil != null || value.suppressUntil != null || value.overrideIntervalMs != null,
    { message: 'Temporary override must define at least one effect' },
  );

export const ClearRoutineTemporaryOverrideRequestSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
});

export const RoutineMutationReceiptSchema = z.object({
  id: z.string().trim().min(1),
  version: z.number().int().positive().optional(),
});

export type RoutineTriggerDto = z.infer<typeof RoutineTriggerSchema>;
export type RoutineDefinitionDto = z.infer<typeof RoutineDefinitionSchema>;
export type RoutineProfileDto = z.infer<typeof RoutineProfileSchema>;
export type RoutineMembershipDto = z.infer<typeof RoutineMembershipSchema>;
export type RoutineTemporaryOverrideDto = z.infer<typeof RoutineTemporaryOverrideSchema>;
export type RoutineRuntimeContextDto = z.infer<typeof RoutineRuntimeContextSchema>;
export type RoutineConfigurationSnapshot = z.infer<typeof RoutineConfigurationSnapshotSchema>;
export type RoutineUpcomingQuery = z.infer<typeof RoutineUpcomingQuerySchema>;
export type RoutineUpcomingOccurrence = z.infer<typeof RoutineUpcomingOccurrenceSchema>;
export type RoutineUpcomingResponse = z.infer<typeof RoutineUpcomingResponseSchema>;
export type CreateRoutineRequest = z.infer<typeof CreateRoutineRequestSchema>;
export type UpdateRoutineRequest = z.infer<typeof UpdateRoutineRequestSchema>;
export type DeleteRoutineRequest = z.infer<typeof DeleteRoutineRequestSchema>;
export type CreateRoutineProfileRequest = z.infer<typeof CreateRoutineProfileRequestSchema>;
export type UpdateRoutineProfileRequest = z.infer<typeof UpdateRoutineProfileRequestSchema>;
export type DeleteRoutineProfileRequest = z.infer<typeof DeleteRoutineProfileRequestSchema>;
export type ReplaceRoutineProfilesRequest = z.infer<typeof ReplaceRoutineProfilesRequestSchema>;
export type SetRoutineMembershipEnabledRequest = z.infer<
  typeof SetRoutineMembershipEnabledRequestSchema
>;
export type SetRoutineProfileActiveRequest = z.infer<typeof SetRoutineProfileActiveRequestSchema>;
export type SetRoutineTemporaryOverrideRequest = z.infer<
  typeof SetRoutineTemporaryOverrideRequestSchema
>;
export type ClearRoutineTemporaryOverrideRequest = z.infer<
  typeof ClearRoutineTemporaryOverrideRequestSchema
>;
export type RoutineMutationReceipt = z.infer<typeof RoutineMutationReceiptSchema>;
