import { randomUUID } from 'node:crypto';
import type { RoutineTrigger } from './trigger';

/** Canonical Routine Coach definition (ADR-059). */
export interface RoutineDefinitionState {
  id: string;
  identityId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: RoutineTrigger | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class RoutineDefinition {
  private constructor(private state: RoutineDefinitionState) {}

  static create(input: {
    id?: string;
    identityId: string;
    name: string;
    description?: string | null;
    enabled?: boolean;
    trigger?: RoutineTrigger | null;
    now?: Date;
  }): RoutineDefinition {
    assertNonEmpty(input.identityId, 'identityId');
    assertNonEmpty(input.name, 'name');
    const now = input.now ?? new Date();
    return new RoutineDefinition({
      id: input.id ?? randomUUID(),
      identityId: input.identityId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      enabled: input.enabled ?? true,
      trigger: input.trigger ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static load(
    state: Omit<RoutineDefinitionState, 'trigger'> & { trigger?: RoutineTrigger | null },
  ): RoutineDefinition {
    return new RoutineDefinition({ ...state, trigger: state.trigger ?? null });
  }

  get id(): string {
    return this.state.id;
  }
  get identityId(): string {
    return this.state.identityId;
  }
  get name(): string {
    return this.state.name;
  }
  get description(): string | null {
    return this.state.description;
  }
  get enabled(): boolean {
    return this.state.enabled;
  }
  get trigger(): RoutineTrigger | null {
    return this.state.trigger;
  }
  get version(): number {
    return this.state.version;
  }
  get createdAt(): Date {
    return this.state.createdAt;
  }
  get updatedAt(): Date {
    return this.state.updatedAt;
  }

  enable(now = new Date()): void {
    if (this.state.enabled) return;
    this.state.enabled = true;
    this.touch(now);
  }

  disable(now = new Date()): void {
    if (!this.state.enabled) return;
    this.state.enabled = false;
    this.touch(now);
  }

  setTrigger(trigger: RoutineTrigger | null, now = new Date()): void {
    if (this.state.trigger === trigger) return;
    this.state.trigger = trigger;
    this.touch(now);
  }

  snapshot(): RoutineDefinitionState {
    return { ...this.state };
  }

  private touch(now: Date): void {
    this.state.version += 1;
    this.state.updatedAt = now;
  }
}

export interface RoutineProfileState {
  id: string;
  identityId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Disabling/deactivating a profile never mutates membership state. */
export class RoutineProfile {
  private constructor(private state: RoutineProfileState) {}

  static create(input: {
    id?: string;
    identityId: string;
    name: string;
    description?: string | null;
    enabled?: boolean;
    now?: Date;
  }): RoutineProfile {
    assertNonEmpty(input.identityId, 'identityId');
    assertNonEmpty(input.name, 'name');
    const now = input.now ?? new Date();
    return new RoutineProfile({
      id: input.id ?? randomUUID(),
      identityId: input.identityId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      enabled: input.enabled ?? true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static load(state: RoutineProfileState): RoutineProfile {
    return new RoutineProfile({ ...state });
  }

  get id(): string {
    return this.state.id;
  }
  get identityId(): string {
    return this.state.identityId;
  }
  get name(): string {
    return this.state.name;
  }
  get description(): string | null {
    return this.state.description;
  }
  get enabled(): boolean {
    return this.state.enabled;
  }
  get version(): number {
    return this.state.version;
  }
  get createdAt(): Date {
    return this.state.createdAt;
  }
  get updatedAt(): Date {
    return this.state.updatedAt;
  }

  enable(now = new Date()): void {
    if (this.state.enabled) return;
    this.state.enabled = true;
    this.touch(now);
  }

  disable(now = new Date()): void {
    if (!this.state.enabled) return;
    this.state.enabled = false;
    this.touch(now);
  }

  snapshot(): RoutineProfileState {
    return { ...this.state };
  }

  private touch(now: Date): void {
    this.state.version += 1;
    this.state.updatedAt = now;
  }
}

export interface ProfileMembershipState {
  identityId: string;
  profileId: string;
  routineId: string;
  enabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** M:N edge with an independent enabled state per (profile,routine) pair. */
export class ProfileMembership {
  private constructor(private state: ProfileMembershipState) {}

  static create(input: {
    identityId: string;
    profileId: string;
    routineId: string;
    enabled?: boolean;
    now?: Date;
  }): ProfileMembership {
    assertNonEmpty(input.identityId, 'identityId');
    assertNonEmpty(input.profileId, 'profileId');
    assertNonEmpty(input.routineId, 'routineId');
    const now = input.now ?? new Date();
    return new ProfileMembership({
      identityId: input.identityId,
      profileId: input.profileId,
      routineId: input.routineId,
      enabled: input.enabled ?? true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static load(state: ProfileMembershipState): ProfileMembership {
    return new ProfileMembership({ ...state });
  }

  get identityId(): string {
    return this.state.identityId;
  }
  get profileId(): string {
    return this.state.profileId;
  }
  get routineId(): string {
    return this.state.routineId;
  }
  get enabled(): boolean {
    return this.state.enabled;
  }
  get version(): number {
    return this.state.version;
  }
  get createdAt(): Date {
    return this.state.createdAt;
  }
  get updatedAt(): Date {
    return this.state.updatedAt;
  }

  enable(now = new Date()): void {
    if (this.state.enabled) return;
    this.state.enabled = true;
    this.touch(now);
  }

  disable(now = new Date()): void {
    if (!this.state.enabled) return;
    this.state.enabled = false;
    this.touch(now);
  }

  snapshot(): ProfileMembershipState {
    return { ...this.state };
  }

  private touch(now: Date): void {
    this.state.version += 1;
    this.state.updatedAt = now;
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) {
    throw new TypeError(`${field} must not be empty`);
  }
}
