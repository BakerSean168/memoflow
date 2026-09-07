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
  findDefinition(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<RoutineDefinition | null>;
  deleteDefinition(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<void>;

  upsertProfile(profile: RoutineProfile): Promise<void>;
  findProfile(input: {
    readonly identityId: string;
    readonly profileId: string;
  }): Promise<RoutineProfile | null>;
  listProfiles(input: { readonly identityId: string }): Promise<RoutineProfile[]>;
  findProfilesByIds(input: {
    readonly identityId: string;
    readonly profileIds: readonly string[];
  }): Promise<RoutineProfile[]>;
  deleteProfile(input: { readonly identityId: string; readonly profileId: string }): Promise<void>;

  upsertMembership(membership: ProfileMembership): Promise<void>;
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
  }): Promise<void>;

  /**
   * Atomically replaces all memberships for one routine in this store.
   * The caller supplies the complete desired M:N edge set for the routine.
   */
  replaceRoutineMemberships(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly memberships: readonly ProfileMembership[];
  }): Promise<void>;
}
