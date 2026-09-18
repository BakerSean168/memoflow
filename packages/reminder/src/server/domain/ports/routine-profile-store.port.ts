import type { ProfileMembership, RoutineDefinition, RoutineProfile } from '../routine';

/**
 * Durable Routine Coach registry for definitions, profiles and M:N memberships.
 *
 * This is the canonical persistence seam used while legacy Reminder tables are
 * being retired. Callers depend on domain objects rather than Prisma/PowerSync
 * row shapes so the cloud and local lanes share one semantic contract.
 */
export interface RoutineProfileStore {
  upsertDefinition(definition: RoutineDefinition): Promise<void>;
  updateDefinition(input: {
    readonly definition: RoutineDefinition;
    readonly expectedVersion: number;
  }): Promise<void>;
  createDefinitionWithMemberships(input: {
    readonly definition: RoutineDefinition;
    readonly memberships: readonly ProfileMembership[];
  }): Promise<void>;
  findDefinition(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<RoutineDefinition | null>;
  /** Owner read seam used by Routine portability; rows never cross this boundary. */
  listDefinitions(input: { readonly identityId: string }): Promise<RoutineDefinition[]>;
  deleteDefinition(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly expectedVersion?: number;
  }): Promise<void>;

  upsertProfile(profile: RoutineProfile): Promise<void>;
  updateProfile(input: {
    readonly profile: RoutineProfile;
    readonly expectedVersion: number;
  }): Promise<void>;
  findProfile(input: {
    readonly identityId: string;
    readonly profileId: string;
  }): Promise<RoutineProfile | null>;
  listProfiles(input: { readonly identityId: string }): Promise<RoutineProfile[]>;
  findProfilesByIds(input: {
    readonly identityId: string;
    readonly profileIds: readonly string[];
  }): Promise<RoutineProfile[]>;
  deleteProfile(input: {
    readonly identityId: string;
    readonly profileId: string;
    readonly expectedVersion?: number;
  }): Promise<void>;

  upsertMembership(
    membership: ProfileMembership,
    expectedVersion?: number,
  ): Promise<void>;
  listMembershipsForRoutine(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<ProfileMembership[]>;
  listMembershipsForRoutines(input: {
    readonly identityId: string;
    readonly routineIds: readonly string[];
  }): Promise<ProfileMembership[]>;
  listMembershipsForProfile(input: {
    readonly identityId: string;
    readonly profileId: string;
  }): Promise<ProfileMembership[]>;
  deleteMembership(input: {
    readonly identityId: string;
    readonly profileId: string;
    readonly routineId: string;
    readonly expectedVersion?: number;
  }): Promise<void>;

  /**
   * Atomically replaces all memberships for one routine in this store.
   * The caller supplies the complete desired M:N edge set for the routine.
   */
  replaceRoutineMemberships(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly memberships: readonly ProfileMembership[];
    readonly expectedVersion?: number;
  }): Promise<void>;
}
