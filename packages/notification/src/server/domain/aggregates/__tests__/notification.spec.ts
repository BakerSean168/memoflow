import { describe, expect, it } from 'vitest';
import {
  NotificationCategory,
  NotificationChannelType,
  NotificationType,
} from '@memoflow/contracts/notification';
import { Notification } from '../notification';
import { NotificationChannel } from '../../entities/notification-channel';

function createFact() {
  return Notification.create({
    identityId: 'identity-1' as never,
    workflowKey: 'task.deadline',
    topic: 'task.deadline',
    idempotencyKey: 'task:1:deadline',
    title: 'Deadline',
    content: 'Task is due soon',
    type: NotificationType.Reminder,
    category: NotificationCategory.Task,
    relatedEntityId: 'task-1',
    navigationIntent: { route: '/tasks/task-1' },
    correlationId: 'corr-1',
    causationId: 'cause-1',
  });
}

describe('Notification Fact aggregate', () => {
  it('creates an unread user-visible Fact with stable business identity', () => {
    const fact = createFact();
    expect(fact.workflowKey).toBe('task.deadline');
    expect(fact.topic).toBe('task.deadline');
    expect(fact.idempotencyKey).toBe('task:1:deadline');
    expect(fact.isRead).toBe(false);
    expect(fact.readAt).toBeNull();
    expect(fact.toServerDTO()).not.toHaveProperty('status');
  });

  it('emits a created event for the Fact without introducing delivery state', () => {
    const fact = createFact();
    expect(fact.domainEvents.map((event) => event.eventType)).toContain('notification:created');
    expect(fact.domainEvents.map((event) => event.eventType)).not.toContain('notification:sent');
    expect(fact.domainEvents.map((event) => event.eventType)).not.toContain('notification:status-changed');
  });

  it('marks read as Fact presentation state only', () => {
    const fact = createFact();
    fact.clearDomainEvents();
    fact.markAsRead();
    expect(fact.isRead).toBe(true);
    expect(fact.readAt).toEqual(expect.any(Number));
    expect(fact.domainEvents.map((event) => event.eventType)).toEqual(['notification:read']);
    expect(fact.toServerDTO()).not.toHaveProperty('status');
  });

  it('markAsRead is idempotent', () => {
    const fact = createFact();
    fact.clearDomainEvents();
    fact.markAsRead();
    const firstReadAt = fact.readAt;
    fact.markAsRead();
    expect(fact.readAt).toBe(firstReadAt);
    expect(fact.domainEvents).toHaveLength(1);
  });

  it('marks unread without fabricating a delivery outcome', () => {
    const fact = createFact();
    fact.markAsRead();
    fact.markAsUnread();
    expect(fact.isRead).toBe(false);
    expect(fact.readAt).toBeNull();
    expect(fact.toServerDTO()).not.toHaveProperty('status');
  });

  it('keeps the semantic Fact content immutable after creation', () => {
    const fact = createFact();
    const content = {
      title: fact.title,
      content: fact.content,
      navigationIntent: fact.navigationIntent,
      expiresAt: fact.expiresAt,
    };
    expect(fact).not.toHaveProperty('updateDetails');
    expect({
      title: fact.title,
      content: fact.content,
      navigationIntent: fact.navigationIntent,
      expiresAt: fact.expiresAt,
    }).toEqual(content);
  });

  it('defensively copies nested navigation intent content', () => {
    const input = { route: '/tasks/task-1', params: { tab: 'activity' } };
    const fact = Notification.create({
      ...createFact().toServerDTO(),
      identityId: 'identity-1' as never,
      navigationIntent: input,
      type: NotificationType.Reminder,
      category: NotificationCategory.Task,
      title: 'Deadline',
      content: 'Task is due soon',
      workflowKey: 'task.deadline',
      topic: 'task.deadline',
      idempotencyKey: 'task:1:deadline:copy',
    });
    input.params.tab = 'mutated-input';
    const exposed = fact.navigationIntent;
    if (exposed?.params) exposed.params.tab = 'mutated-output';
    expect(fact.navigationIntent).toEqual({
      route: '/tasks/task-1',
      params: { tab: 'activity' },
    });
    const dto = fact.toServerDTO();
    if (dto.navigationIntent?.params) dto.navigationIntent.params.tab = 'mutated-dto';
    expect(fact.toServerDTO().navigationIntent).toEqual({
      route: '/tasks/task-1',
      params: { tab: 'activity' },
    });
  });

  it('soft deletes the Fact idempotently', () => {
    const fact = createFact();
    fact.clearDomainEvents();
    fact.softDelete();
    const deletedAt = fact.deletedAt;
    fact.softDelete();
    expect(deletedAt).toBeInstanceOf(Date);
    expect(fact.deletedAt).toBe(deletedAt);
    expect(fact.domainEvents.map((event) => event.eventType)).toEqual(['notification:deleted']);
  });

  it('projects durable channel attempts without making them root Fact status', () => {
    const fact = createFact();
    const channel = NotificationChannel.create({
      notificationId: fact.id,
      channelType: NotificationChannelType.Desktop,
      recipient: 'identity-1',
    });
    fact.addChannel(channel);
    expect(fact.getChannelByType(NotificationChannelType.Desktop)).toBe(channel);
    expect(fact.toServerDTO().notificationChannels).toHaveLength(1);
    expect(fact.toServerDTO()).not.toHaveProperty('status');
  });

  it('serializes workflow, topic, navigation, related entity, importance and urgency on the Fact', () => {
    const dto = createFact().toServerDTO();
    expect(dto).toMatchObject({
      workflowKey: 'task.deadline',
      topic: 'task.deadline',
      idempotencyKey: 'task:1:deadline',
      relatedEntityId: 'task-1',
      navigationIntent: { route: '/tasks/task-1' },
      correlationId: 'corr-1',
      causationId: 'cause-1',
      isRead: false,
    });
    expect(dto.importance).toBeDefined();
    expect(dto.urgency).toBeDefined();
  });

  it('reconstructs persisted Fact state without a delivery-status field', () => {
    const original = createFact();
    const loaded = Notification.load({
      id: original.id,
      identityId: original.identityId,
      workflowKey: original.workflowKey,
      topic: original.topic,
      idempotencyKey: original.idempotencyKey,
      title: original.title,
      content: original.content,
      type: original.type,
      category: original.category,
      importance: original.importance,
      urgency: original.urgency,
      relatedEntityType: original.relatedEntityType,
      relatedEntityId: original.relatedEntityId,
      navigationIntent: original.navigationIntent,
      correlationId: original.correlationId,
      causationId: original.causationId,
      isRead: false,
      readAt: null,
      actions: null,
      metadata: null,
      expiresAt: null,
      version: 1,
      deletedAt: null,
      createdAt: original.createdAt,
      updatedAt: original.updatedAt,
      notificationChannels: [],
    });
    expect(loaded.toServerDTO()).toMatchObject({
      workflowKey: 'task.deadline',
      idempotencyKey: 'task:1:deadline',
      isRead: false,
    });
    expect(loaded.toServerDTO()).not.toHaveProperty('status');
  });
});
