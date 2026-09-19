import { describe, expect, it } from 'vitest';
import { CreateNotificationSchema } from './notification-crud.dto';
import { NotificationQuerySchema } from './notification-query.dto';
import { NotificationActionIntentSchema, NotificationEntityRefSchema } from './notification-action.dto';

describe('Notification open EntityRef contract (ADR-087)', () => {
  it('accepts owner types without a central RelatedEntityType registry', () => {
    expect(NotificationEntityRefSchema.parse({ type: 'routine', id: 'routine-1' })).toEqual({
      type: 'routine',
      id: 'routine-1',
    });
    expect(NotificationEntityRefSchema.parse({ type: 'plugin.custom', id: 'Entity_550e8400-e29b-41d4-a716-446655440009' }).type).toBe(
      'plugin.custom',
    );
  });

  it('uses the same open subject vocabulary across Fact create/query and owner actions', () => {
    const created = CreateNotificationSchema.parse({
      workflowKey: 'system.general',
      title: 'Open subject',
      content: 'Open subject contract',
      type: 'Info',
      category: 'System',
      relatedEntityType: 'plugin.custom',
      relatedEntityId: 'Entity_550e8400-e29b-41d4-a716-446655440009',
    });
    const query = NotificationQuerySchema.parse({
      relatedEntityType: 'plugin.custom',
      relatedEntityId: 'Entity_550e8400-e29b-41d4-a716-446655440009',
    });
    const action = NotificationActionIntentSchema.parse({
      kind: 'owner-command',
      actionKey: 'ack',
      labelKey: 'notification.action.ack',
      owner: { type: 'plugin.custom', id: 'Entity_550e8400-e29b-41d4-a716-446655440009' },
      commandKey: 'acknowledge',
    });

    expect(created.relatedEntityType).toBe('plugin.custom');
    expect(query.relatedEntityType).toBe('plugin.custom');
    expect(action.kind === 'owner-command' ? action.owner.type : null).toBe('plugin.custom');
  });
});
