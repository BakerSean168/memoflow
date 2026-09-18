export interface AssistantConversationShellSnapshot {
  readonly title?: string;
}

/** Read-only ownership seam for the product-owned Conversation shell. */
export interface AssistantConversationShellSource {
  loadShell(input: {
    identityId: string;
    conversationId: string;
  }): Promise<AssistantConversationShellSnapshot | null>;
}
