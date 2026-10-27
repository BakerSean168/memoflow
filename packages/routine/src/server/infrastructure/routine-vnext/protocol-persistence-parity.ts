import { z } from 'zod';
import { asInstant } from '@memoflow/time';
import {
  PROTOCOL_PHASE_KINDS,
  PROTOCOL_SESSION_STATES,
  ProtocolDefinition,
  ProtocolSession,
  type ProtocolDefinitionState,
  type ProtocolSessionSnapshot,
} from '../../domain/routine';

const PhaseKindSchema = z.enum(PROTOCOL_PHASE_KINDS);
const PhaseRoleSchema = z.enum(['session-start', 'cycle', 'session-end']);
const InstantSchema = z
  .number()
  .finite()
  .transform((value) => asInstant(value));
const NullableInstantSchema = InstantSchema.nullable();
const PhaseSchema = z.object({
  id: z.string().trim().min(1),
  kind: PhaseKindSchema,
  role: PhaseRoleSchema,
  durationMs: z.number().positive().finite().nullable(),
});
const CyclePolicySchema = z.object({
  mode: z.literal('fixed'),
  cycles: z.number().int().positive(),
});
const BreakPolicySchema = z.object({
  afterFinalCycle: z.enum(['include', 'skip']),
  longBreakEveryCycles: z.number().int().positive().nullable(),
  longBreakDurationMs: z.number().positive().finite().nullable(),
});
const ProtocolDefinitionStateSchema = z.object({
  id: z.string().trim().min(1),
  identityId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  phases: z.array(PhaseSchema).min(1),
  cyclePolicy: CyclePolicySchema,
  breakPolicy: BreakPolicySchema,
  version: z.number().int().positive(),
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
});
const PhasePlanEntrySchema = PhaseSchema.extend({
  cycle: z.number().int().positive().nullable(),
});
const TerminationReasonSchema = z.enum([
  'completed',
  'user-ended',
  'user-cancelled',
  'superseded',
  'runtime-aborted',
]);
const ProtocolSessionSnapshotSchema = z.object({
  id: z.string().trim().min(1),
  identityId: z.string().trim().min(1),
  protocolId: z.string().trim().min(1),
  protocolVersion: z.number().int().positive(),
  protocolSnapshot: ProtocolDefinitionStateSchema,
  phasePlan: z.array(PhasePlanEntrySchema).min(1),
  state: z.enum(PROTOCOL_SESSION_STATES),
  currentPlanIndex: z.number().int().nonnegative().nullable(),
  startedAt: NullableInstantSchema,
  phaseStartedAt: NullableInstantSchema,
  phaseDeadline: NullableInstantSchema,
  pausedAt: NullableInstantSchema,
  pausedRemainingMs: z.number().nonnegative().finite().nullable(),
  accumulatedPauseMs: z.number().nonnegative().finite(),
  endedAt: NullableInstantSchema,
  terminationReason: TerminationReasonSchema.nullable(),
  version: z.number().int().positive(),
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
});

export const ROUTINE_PROTOCOL_PERSISTENCE_TABLES = {
  definitions: 'routine_protocol_definitions',
  sessions: 'routine_protocol_sessions',
} as const;

export interface ProtocolDefinitionPrismaRecord {
  id: string;
  identityId: string;
  name: string;
  definitionJson: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProtocolDefinitionPowerSyncRecord {
  id: string;
  identity_id: string;
  name: string;
  definition_json: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ProtocolSessionPrismaRecord {
  id: string;
  identityId: string;
  protocolId: string;
  protocolVersion: number;
  status: string;
  snapshotJson: string;
  terminationReason: string | null;
  endedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProtocolSessionPowerSyncRecord {
  id: string;
  identity_id: string;
  protocol_id: string;
  protocol_version: number;
  status: string;
  snapshot_json: string;
  termination_reason: string | null;
  ended_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export function serializeProtocolDefinitionState(state: ProtocolDefinitionState): string {
  return JSON.stringify(state);
}

export function deserializeProtocolDefinition(raw: string): ProtocolDefinition {
  const parsed = ProtocolDefinitionStateSchema.parse(JSON.parse(raw));
  return ProtocolDefinition.load(parsed as ProtocolDefinitionState);
}

export function serializeProtocolSessionSnapshot(snapshot: ProtocolSessionSnapshot): string {
  return JSON.stringify(snapshot);
}

export function deserializeProtocolSession(raw: string): ProtocolSession {
  const parsed = ProtocolSessionSnapshotSchema.parse(JSON.parse(raw));
  return ProtocolSession.load(parsed as ProtocolSessionSnapshot);
}

export function protocolDefinitionToPrisma(
  definition: ProtocolDefinition,
): ProtocolDefinitionPrismaRecord {
  const state = definition.snapshot();
  return {
    id: state.id,
    identityId: state.identityId,
    name: state.name,
    definitionJson: serializeProtocolDefinitionState(state),
    version: state.version,
    createdAt: new Date(Number(state.createdAt)),
    updatedAt: new Date(Number(state.updatedAt)),
  };
}

export function protocolDefinitionToPowerSync(
  definition: ProtocolDefinition,
): ProtocolDefinitionPowerSyncRecord {
  const state = definition.snapshot();
  return {
    id: state.id,
    identity_id: state.identityId,
    name: state.name,
    definition_json: serializeProtocolDefinitionState(state),
    version: state.version,
    created_at: new Date(Number(state.createdAt)).toISOString(),
    updated_at: new Date(Number(state.updatedAt)).toISOString(),
  };
}

export function protocolSessionToPrisma(session: ProtocolSession): ProtocolSessionPrismaRecord {
  const snapshot = session.snapshot();
  return {
    id: snapshot.id,
    identityId: snapshot.identityId,
    protocolId: snapshot.protocolId,
    protocolVersion: snapshot.protocolVersion,
    status: snapshot.state,
    snapshotJson: serializeProtocolSessionSnapshot(snapshot),
    terminationReason: snapshot.terminationReason,
    endedAt: snapshot.endedAt == null ? null : new Date(Number(snapshot.endedAt)),
    version: snapshot.version,
    createdAt: new Date(Number(snapshot.createdAt)),
    updatedAt: new Date(Number(snapshot.updatedAt)),
  };
}

export function protocolSessionToPowerSync(
  session: ProtocolSession,
): ProtocolSessionPowerSyncRecord {
  const snapshot = session.snapshot();
  return {
    id: snapshot.id,
    identity_id: snapshot.identityId,
    protocol_id: snapshot.protocolId,
    protocol_version: snapshot.protocolVersion,
    status: snapshot.state,
    snapshot_json: serializeProtocolSessionSnapshot(snapshot),
    termination_reason: snapshot.terminationReason,
    ended_at: snapshot.endedAt == null ? null : new Date(Number(snapshot.endedAt)).toISOString(),
    version: snapshot.version,
    created_at: new Date(Number(snapshot.createdAt)).toISOString(),
    updated_at: new Date(Number(snapshot.updatedAt)).toISOString(),
  };
}

export function normalizeProtocolDefinitionPrisma(
  record: ProtocolDefinitionPrismaRecord,
): Record<string, unknown> {
  return {
    id: record.id,
    identityId: record.identityId,
    name: record.name,
    definition: JSON.parse(record.definitionJson),
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function normalizeProtocolDefinitionPowerSync(
  record: ProtocolDefinitionPowerSyncRecord,
): Record<string, unknown> {
  return {
    id: record.id,
    identityId: record.identity_id,
    name: record.name,
    definition: JSON.parse(record.definition_json),
    version: record.version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function normalizeProtocolSessionPrisma(
  record: ProtocolSessionPrismaRecord,
): Record<string, unknown> {
  return {
    id: record.id,
    identityId: record.identityId,
    protocolId: record.protocolId,
    protocolVersion: record.protocolVersion,
    status: record.status,
    snapshot: JSON.parse(record.snapshotJson),
    terminationReason: record.terminationReason,
    endedAt: record.endedAt?.toISOString() ?? null,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function normalizeProtocolSessionPowerSync(
  record: ProtocolSessionPowerSyncRecord,
): Record<string, unknown> {
  return {
    id: record.id,
    identityId: record.identity_id,
    protocolId: record.protocol_id,
    protocolVersion: record.protocol_version,
    status: record.status,
    snapshot: JSON.parse(record.snapshot_json),
    terminationReason: record.termination_reason,
    endedAt: record.ended_at,
    version: record.version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
