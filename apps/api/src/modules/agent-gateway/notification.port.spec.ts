import { describe, expect, it, vi } from 'vitest';
import { GatewayReadError } from '@memoflow/agent-gateway';
import type { GatewayWriteAuthority } from '@memoflow/agent-gateway';
import type { NotificationInboxPort } from '@memoflow/notification';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { error, ok } from '@memoflow/transport-contracts/result';
import { bindNotificationMarkRead, bindNotificationReadPort } from './notification.port';

interface Row {
  id: string;
  identityId: string;
  workflowKey: string;
  topic: string;
  title: string;
  content: string;
  type: 'Reminder';
  category: 'Goal';
  importance: 'Moderate';
  urgency: 'Medium';
  isRead: boolean;
  readAt: number | null;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  version: number;
  idempotencyKey: string;
  metadata: { secret: string };
  actions: { key: string }[];
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'notification-1',
    identityId: 'owner-a',
    workflowKey: 'goal.reminder',
    topic: 'goal',
    title: 'Goal reminder',
    content: 'Review the goal',
    type: 'Reminder',
    category: 'Goal',
    importance: 'Moderate',
    urgency: 'Medium',
    isRead: false,
    readAt: null,
    archivedAt: null,
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    idempotencyKey: 'internal-key',
    metadata: { secret: 'owner-private' },
    actions: [{ key: 'open' }],
    ...overrides,
  };
}

/** Owner-shaped fake: every read is scoped by the caller's identity. */
function inbox(rows: Row[]) {
  const listNotifications = vi.fn(async (query: unknown) => {
    const parsed = query as { identityId: string; page: number; limit: number };
    const owned = rows.filter((item) => item.identityId === parsed.identityId);
    return ok({
      notifications: owned.slice(0, parsed.limit),
      total: owned.length,
      page: parsed.page,
      pageSize: parsed.limit,
      hasMore: false,
    });
  });
  const getUnreadCount = vi.fn(async (identityId: string) =>
    ok({ count: rows.filter((item) => item.identityId === identityId && !item.isRead).length }),
  );
  const markAsRead = vi.fn(async (id: string, identityId: string) => {
    const target = rows.find((item) => item.id === id && item.identityId === identityId);
    if (!target) return error('NOT_FOUND', `Notification not found: ${id}`);
    target.isRead = true;
    target.readAt = 9;
    target.version += 1;
    target.updatedAt = 10;
    return ok(target);
  });
  return {
    port: { listNotifications, getUnreadCount, markAsRead } as unknown as NotificationInboxPort,
    listNotifications,
    getUnreadCount,
    markAsRead,
  };
}

const context = (identityId: string): ExecutionContext => ({
  requestId: 'request-a',
  traceId: 'trace-a',
  startedAt: 1,
  source: 'http',
  identityId,
});
const authority: GatewayWriteAuthority = {
  connectionId: 'pat-a',
  scopes: ['notifications:write'],
  authorize: async () => {},
};

describe('Notification owner binding', () => {
  it('projects only the whitelist and truncates long bodies and titles', async () => {
    const f = inbox([row({ content: 'x'.repeat(2500), title: 't'.repeat(600) })]);
    const page = await bindNotificationReadPort(f.port).listNotifications(
      { archiveState: 'active', page: 1, limit: 20 },
      context('owner-a'),
    );
    expect(page.items[0]).toMatchObject({
      id: 'notification-1',
      contentTruncated: true,
      title: 't'.repeat(500),
    });
    expect(page.items[0].content).toHaveLength(2000);
    const serialized = JSON.stringify(page.items[0]);
    for (const hidden of ['identityId', 'idempotencyKey', 'metadata', 'actions', 'owner-private'])
      expect(serialized).not.toContain(hidden);
    expect(f.listNotifications).toHaveBeenCalledWith({
      identityId: 'owner-a',
      archiveState: 'active',
      page: 1,
      limit: 20,
    });
  });

  it('never surfaces another owner rows or unread counts', async () => {
    const f = inbox([row()]);
    const reads = bindNotificationReadPort(f.port);
    const other = context('owner-b');
    expect(
      await reads.listNotifications({ archiveState: 'active', page: 1, limit: 20 }, other),
    ).toMatchObject({ items: [], total: 0, hasMore: false });
    expect(await reads.getUnreadCount(other)).toBe(0);
    expect(await reads.getUnreadCount(context('owner-a'))).toBe(1);
  });

  it('maps a foreign notification id to NOT_FOUND without mutating it', async () => {
    const target = row();
    const f = inbox([target]);
    const markRead = bindNotificationMarkRead(f.port);
    await expect(markRead({ id: target.id }, context('owner-b'), authority)).rejects.toBeInstanceOf(
      GatewayReadError,
    );
    await expect(markRead({ id: target.id }, context('owner-b'), authority)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(target.isRead).toBe(false);
    expect(target.version).toBe(1);
  });

  it('returns the minimal state receipt for the owner and revalidates the authority', async () => {
    const target = row();
    const f = inbox([target]);
    const markRead = bindNotificationMarkRead(f.port);
    const authorize = vi.fn(async () => {});
    expect(
      await markRead({ id: target.id }, context('owner-a'), { ...authority, authorize }),
    ).toEqual({ id: target.id, isRead: true, readAt: 9, version: 2, updatedAt: 10 });
    expect(authorize).toHaveBeenCalledOnce();
    expect(f.markAsRead).toHaveBeenCalledWith(target.id, 'owner-a');
    await expect(
      markRead({ id: target.id }, context('owner-a'), { ...authority, scopes: ['goals:read'] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.markAsRead).toHaveBeenCalledOnce();
  });
});
