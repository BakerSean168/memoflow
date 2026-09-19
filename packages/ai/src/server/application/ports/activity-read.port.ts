/**
 * Small recent-activity projection consumed by AI analytics.
 *
 * This is intentionally a consumer capability, not an Activity or analytics
 * domain. HOME-1804 decides whether the current durable source should survive
 * behind a narrower owner capability.
 */
export interface AIActivityItem {
  readonly id: string;
  readonly type: string;
  readonly description: string;
  readonly timestamp: number;
}

/** Read-only, identity-scoped recent activity capability for AI analytics. */
export interface IAIActivityReadPort {
  listRecent(input: {
    readonly identityId: string;
    /** Inclusive lower bound expressed as a Product Time instant. */
    readonly since: number;
    readonly limit?: number;
  }): Promise<readonly AIActivityItem[]>;
}
