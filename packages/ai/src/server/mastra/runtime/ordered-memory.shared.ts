import type { MastraDBMessage } from '@mastra/core/agent';

/** Match Mastra stores: content may already be serialized, and createdAt is optional at runtime. */
export function serializeContent(content: MastraDBMessage['content'] | string): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

export function requestedTimestamp(createdAt: Date | string | number | undefined | null): number {
  const time = createdAt == null ? Number.NaN : new Date(createdAt).getTime();
  return Number.isFinite(time) ? time : Date.now();
}
