import type { NotificationActionIntent } from '@memoflow/contracts/notification';

export interface AINotificationFactProjection {
  readonly id: string;
  readonly workflowKey: string;
  readonly topicKey: string | null;
  readonly title: string;
  readonly content: string;
  readonly presentation: {
    readonly importance: string;
    readonly urgency: string;
  };
  readonly subjectRef: { readonly type: string; readonly id: string } | null;
  readonly navigationIntent: {
    readonly route: string;
    readonly params?: Readonly<Record<string, string>>;
  } | null;
  readonly actions: readonly NotificationActionIntent[];
  readonly readAt: number | null;
  readonly archivedAt: number | null;
  readonly createdAt: number;
}

export interface AIUnreadNotificationSummary {
  readonly unreadCount: number;
  readonly items: readonly AINotificationFactProjection[];
}

export interface AINotificationActionReceipt {
  readonly id: string;
  readonly notificationId: string;
  readonly actionKey: string;
  readonly actionKind: NotificationActionIntent['kind'];
  readonly outcome: 'accepted' | 'rejected' | 'failed';
  readonly commandReceiptId: string | null;
}

/** Product-facing Notification Fact/Inbox projection and typed action seam. */
export interface IAINotificationReadPort {
  getUnreadSummary(input: {
    readonly identityId: string;
    readonly limit?: number;
  }): Promise<AIUnreadNotificationSummary>;
  executeAction(input: {
    readonly context: import('@memoflow/contracts/shared').ExecutionContext;
    readonly notificationId: string;
    readonly actionKey: string;
  }): Promise<AINotificationActionReceipt>;
}
