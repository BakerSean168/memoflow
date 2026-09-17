import { describe, expect, it } from 'vitest';
import { NotificationPrismaMapper, type PrismaNotificationRow } from './notification-prisma.mapper';

function row(): PrismaNotificationRow {
  return {
    id: 'INotificationId_550e8400-e29b-41d4-a716-446655440002',
    identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440003',
    workflowKey: 'system.general',
    topic: 'system.general',
    idempotencyKey: 'mapper-fixture',
    title: 'Mapped Fact',
    content: 'Fact content',
    type: 'Info',
    category: 'System',
    importance: 'Moderate',
    urgency: 'Medium',
    isRead: false,
    readAt: null,
    expiresAt: null,
    relatedEntityType: null,
    relatedEntityId: null,
    metadata: null,
    actions: null,
    navigationIntent: null,
    correlationId: null,
    causationId: null,
    version: 1,
    createdAt: new Date('2026-09-17T08:00:00.000Z'),
    updatedAt: new Date('2026-09-17T08:00:00.000Z'),
    deletedAt: null,
    archivedAt: null,
  };
}

describe('NotificationPrismaMapper', () => {
  it('hydrates Notification Fact without delivery-channel child truth', () => {
    const fact = NotificationPrismaMapper.toDomain(row());
    expect(fact.toServerDTO()).toMatchObject({
      workflowKey: 'system.general',
      title: 'Mapped Fact',
      isRead: false,
    });
    expect(fact.toServerDTO()).not.toHaveProperty('notificationChannels');
  });
});
