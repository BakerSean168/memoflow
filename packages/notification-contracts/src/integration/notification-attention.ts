import type { NotificationClientDTO } from '../aggregates/notification-client';

/** Read-only owner facts; never persisted as inbox state. */
export interface NotificationOwnerAttention {
  readonly groupKey: string;
  readonly needsAction: boolean;
  readonly nextAttentionAt: number | null;
}
export type NotificationOwnerAttentionReader = (input: {
  readonly identityId: string;
  readonly notifications: readonly NotificationClientDTO[];
  readonly now: number;
}) => Promise<ReadonlyMap<string, NotificationOwnerAttention>>;
