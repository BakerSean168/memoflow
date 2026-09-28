import type { RoutinePreferences } from '../routine';

export interface RoutinePreferencesStore {
  find(input: { readonly identityId: string }): Promise<RoutinePreferences | null>;

  create(input: { readonly preferences: RoutinePreferences }): Promise<void>;

  update(input: {
    readonly preferences: RoutinePreferences;
    readonly expectedVersion: number;
  }): Promise<void>;
}
