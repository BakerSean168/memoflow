import type { RoutineRuntimeContext } from '../routine';

export interface RoutineRuntimeContextUpdateReceipt {
  readonly identityId: string;
  readonly profileId: string;
  readonly active: boolean;
  readonly version: number;
}

export interface RoutineRuntimeContextStore {
  get(input: { readonly identityId: string }): RoutineRuntimeContext;
  setProfileActive(input: {
    readonly identityId: string;
    readonly profileId: string;
    readonly active: boolean;
    readonly at?: number;
  }): RoutineRuntimeContextUpdateReceipt;
}
