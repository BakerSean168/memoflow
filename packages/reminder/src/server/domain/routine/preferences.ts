export interface RoutinePreferencesState {
  readonly id: string;
  readonly identityId: string;
  readonly globalEnabled: boolean;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Identity-scoped master gate for Routine execution.
 *
 * This is intentionally separate from RoutineDefinition/Profile/Membership state:
 * toggling the global gate must never rewrite child enabled flags, so restoring it
 * can resume the exact previous configuration.
 */
export class RoutinePreferences {
  private constructor(private state: RoutinePreferencesState) {}

  static create(input: {
    readonly identityId: string;
    readonly id?: string;
    readonly globalEnabled?: boolean;
    readonly now?: Date;
  }): RoutinePreferences {
    const identityId = input.identityId.trim();
    if (!identityId) throw new TypeError('identityId must not be empty');
    const now = input.now ?? new Date();
    return new RoutinePreferences({
      id: input.id?.trim() || `routine-preferences:${identityId}`,
      identityId,
      globalEnabled: input.globalEnabled ?? true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static load(state: RoutinePreferencesState): RoutinePreferences {
    if (!state.id.trim() || !state.identityId.trim()) {
      throw new TypeError('Routine preferences ownership fields must not be empty');
    }
    if (!Number.isInteger(state.version) || state.version <= 0) {
      throw new TypeError('Routine preferences version must be a positive integer');
    }
    return new RoutinePreferences({ ...state });
  }

  get id(): string {
    return this.state.id;
  }

  get identityId(): string {
    return this.state.identityId;
  }

  get globalEnabled(): boolean {
    return this.state.globalEnabled;
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

  setGlobalEnabled(globalEnabled: boolean, now = new Date()): boolean {
    if (this.state.globalEnabled === globalEnabled) return false;
    this.state = {
      ...this.state,
      globalEnabled,
      version: this.state.version + 1,
      updatedAt: now,
    };
    return true;
  }

  snapshot(): RoutinePreferencesState {
    return { ...this.state };
  }
}
