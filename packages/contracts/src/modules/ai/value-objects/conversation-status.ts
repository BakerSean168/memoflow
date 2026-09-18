/**
 * 对话状态
 */
export const ConversationStatus = {
  Active: 'Active',
  Archived: 'Archived',
} as const;

export type ConversationStatus = (typeof ConversationStatus)[keyof typeof ConversationStatus];
