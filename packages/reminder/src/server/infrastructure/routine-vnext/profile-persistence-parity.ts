import type {
  ProfileMembershipState,
  RoutineDefinitionState,
  RoutineProfileState,
} from '../../domain/routine';
import { serializeRoutineTrigger } from './trigger-persistence-parity';

/**
 * Lane-owned persistence contract used to keep Prisma and PowerSync mappings
 * semantically identical while the physical shared schemas remain owned by
 * the Wave 2 Schema Train.
 */
export const ROUTINE_PROFILE_PERSISTENCE_TABLES = {
  definitions: 'routine_definitions',
  profiles: 'routine_profiles',
  memberships: 'routine_profile_memberships',
} as const;

export interface RoutineDefinitionPrismaRecord {
  id: string;
  identityId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerJson: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutineProfilePrismaRecord {
  id: string;
  identityId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileMembershipPrismaRecord {
  identityId: string;
  profileId: string;
  routineId: string;
  enabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutineDefinitionPowerSyncRecord {
  id: string;
  identity_id: string;
  name: string;
  description: string | null;
  enabled: 0 | 1;
  trigger_json: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface RoutineProfilePowerSyncRecord {
  id: string;
  identity_id: string;
  name: string;
  description: string | null;
  enabled: 0 | 1;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ProfileMembershipPowerSyncRecord {
  identity_id: string;
  profile_id: string;
  routine_id: string;
  enabled: 0 | 1;
  version: number;
  created_at: string;
  updated_at: string;
}

export function routineDefinitionToPrisma(
  state: RoutineDefinitionState,
): RoutineDefinitionPrismaRecord {
  return {
    id: state.id,
    identityId: state.identityId,
    name: state.name,
    description: state.description,
    enabled: state.enabled,
    triggerJson: serializeRoutineTrigger(state.trigger),
    version: state.version,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

export function routineProfileToPrisma(state: RoutineProfileState): RoutineProfilePrismaRecord {
  return { ...state };
}

export function profileMembershipToPrisma(
  state: ProfileMembershipState,
): ProfileMembershipPrismaRecord {
  return { ...state };
}

export function routineDefinitionToPowerSync(
  state: RoutineDefinitionState,
): RoutineDefinitionPowerSyncRecord {
  return {
    id: state.id,
    identity_id: state.identityId,
    name: state.name,
    description: state.description,
    enabled: boolInt(state.enabled),
    trigger_json: serializeRoutineTrigger(state.trigger),
    version: state.version,
    created_at: state.createdAt.toISOString(),
    updated_at: state.updatedAt.toISOString(),
  };
}

export function routineProfileToPowerSync(
  state: RoutineProfileState,
): RoutineProfilePowerSyncRecord {
  return {
    id: state.id,
    identity_id: state.identityId,
    name: state.name,
    description: state.description,
    enabled: boolInt(state.enabled),
    version: state.version,
    created_at: state.createdAt.toISOString(),
    updated_at: state.updatedAt.toISOString(),
  };
}

export function profileMembershipToPowerSync(
  state: ProfileMembershipState,
): ProfileMembershipPowerSyncRecord {
  return {
    identity_id: state.identityId,
    profile_id: state.profileId,
    routine_id: state.routineId,
    enabled: boolInt(state.enabled),
    version: state.version,
    created_at: state.createdAt.toISOString(),
    updated_at: state.updatedAt.toISOString(),
  };
}

export function normalizePrismaRoutineDefinition(
  record: RoutineDefinitionPrismaRecord,
): Record<string, unknown> {
  return {
    id: record.id,
    identityId: record.identityId,
    name: record.name,
    description: record.description,
    enabled: record.enabled,
    triggerJson: record.triggerJson,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function normalizePowerSyncRoutineDefinition(
  record: RoutineDefinitionPowerSyncRecord,
): Record<string, unknown> {
  return {
    id: record.id,
    identityId: record.identity_id,
    name: record.name,
    description: record.description,
    enabled: record.enabled === 1,
    triggerJson: record.trigger_json,
    version: record.version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function normalizePrismaRoutineProfile(
  record: RoutineProfilePrismaRecord,
): Record<string, unknown> {
  return {
    id: record.id,
    identityId: record.identityId,
    name: record.name,
    description: record.description,
    enabled: record.enabled,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function normalizePowerSyncRoutineProfile(
  record: RoutineProfilePowerSyncRecord,
): Record<string, unknown> {
  return {
    id: record.id,
    identityId: record.identity_id,
    name: record.name,
    description: record.description,
    enabled: record.enabled === 1,
    version: record.version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function normalizePrismaMembership(
  record: ProfileMembershipPrismaRecord,
): Record<string, unknown> {
  return {
    identityId: record.identityId,
    profileId: record.profileId,
    routineId: record.routineId,
    enabled: record.enabled,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function normalizePowerSyncMembership(
  record: ProfileMembershipPowerSyncRecord,
): Record<string, unknown> {
  return {
    identityId: record.identity_id,
    profileId: record.profile_id,
    routineId: record.routine_id,
    enabled: record.enabled === 1,
    version: record.version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function boolInt(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}
