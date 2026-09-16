/**
 * Notification Module - Mock Generators
 *
 * Provides factory functions for generating realistic mock data
 * that conforms to the Notification module contracts.
 *
 * Usage:
 * ```ts
 * import { createMockNotification } from '@memoflow/contracts/mocks';
 * const notification = createMockNotification();
 * ```
 */

import { faker } from '@faker-js/faker';
import type { NotificationClientDTO } from '../modules/notification/aggregates/notification-client';

export function createMockNotification(
  overrides: Partial<NotificationClientDTO> = {},
): NotificationClientDTO {
  const now = Date.now();
  const id = faker.string.uuid();
  const isRead = faker.datatype.boolean();

  return {
    id: id as never,
    identityId: faker.string.uuid() as never,
    workflowKey: 'system.general',
    topic: 'system.general',
    idempotencyKey: `mock:${id}`,
    title: faker.lorem.words({ min: 2, max: 6 }),
    content: faker.lorem.paragraph({ min: 1, max: 3 }),
    type: faker.helpers.arrayElement(['Info', 'Warning', 'Error', 'Success', 'Reminder']),
    category: faker.helpers.arrayElement(['System', 'Task', 'Goal', 'Reminder', 'AI', 'Security']),
    importance: faker.helpers.arrayElement(['Vital', 'Important', 'Moderate', 'Minor', 'Trivial']),
    urgency: faker.helpers.arrayElement(['Low', 'Medium', 'High', 'Critical']),
    relatedEntityType: null,
    relatedEntityId: null,
    navigationIntent: null,
    correlationId: null,
    causationId: null,
    isRead,
    readAt: isRead ? now - faker.number.int({ min: 0, max: 86400000 }) : null,
    actions: faker.datatype.boolean()
      ? [
          {
            type: 'link',
            label: '查看详情',
            url: `/${faker.helpers.arrayElement(['goals', 'tasks', 'settings'])}/${faker.string.uuid()}`,
          },
        ]
      : null,
    metadata: faker.datatype.boolean()
      ? {
          source: faker.helpers.arrayElement([
            'system',
            'task_module',
            'goal_module',
            'ai_service',
          ]),
          priority: faker.number.int({ min: 1, max: 10 }),
        }
      : null,
    version: 1,
    createdAt: now - faker.number.int({ min: 0, max: 7 * 24 * 60 * 60 * 1000 }),
    updatedAt: now,
    deletedAt: null,
    archivedAt: null,
    notificationChannels: null,
    ...overrides,
  } as unknown as NotificationClientDTO;
}

export function createMockNotificationList(
  count = 5,
  overrides: Partial<NotificationClientDTO> = {},
): NotificationClientDTO[] {
  return Array.from({ length: count }, () => createMockNotification(overrides));
}
