/** Native Goal panel lease, never a right to mutate persisted Goal data. */
export interface GoalSurfaceLeaseGrant {
  readonly token: string;
  /** Monotone per identity/run; stale generations cannot renew or release. */
  readonly fence: number;
  readonly expiresAt: number;
}

export interface GoalSurfaceLeaseRequest {
  readonly identityId: string;
  readonly runId: string;
  readonly now: number;
  readonly expiresAt: number;
}

export interface IGoalSurfaceLeaseRepository {
  claim(
    input: GoalSurfaceLeaseRequest & { readonly token: string },
  ): Promise<GoalSurfaceLeaseGrant | null>;
  renew(
    input: GoalSurfaceLeaseRequest & { readonly token: string; readonly fence: number },
  ): Promise<boolean>;
  release(
    input: Pick<GoalSurfaceLeaseRequest, 'identityId' | 'runId' | 'now'> & {
      readonly token: string;
      readonly fence: number;
    },
  ): Promise<boolean>;
}
