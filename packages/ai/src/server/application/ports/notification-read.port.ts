export interface AIUnreadNotificationItem {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly category: string;
  readonly importance: string;
  readonly createdAt: number;
}

export interface AIUnreadNotificationSummary {
  readonly unreadCount: number;
  readonly items: readonly AIUnreadNotificationItem[];
}

/** Read-only Notification Fact projection for the assistant. */
export interface IAINotificationReadPort {
  getUnreadSummary(input: {
    readonly identityId: string;
    readonly limit?: number;
  }): Promise<AIUnreadNotificationSummary>;
}
