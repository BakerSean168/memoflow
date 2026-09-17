/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationClientDTO } from '@memoflow/contracts/notification';
import enNotification from '../../../locales/en-US/notification';
import InAppNotification from './InAppNotification.vue';
import NotificationItem from './NotificationItem.vue';

vi.mock('../../../components/shared', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    ActionableWrapper: defineComponent({
      setup(_, { slots }) {
        return () => h('div', slots.default?.());
      },
    }),
    menuLabel: (key: string) => key,
  };
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { close: 'Close' },
      notification: enNotification,
    },
  },
});

function createNotification(overrides: Partial<NotificationClientDTO> = {}): NotificationClientDTO {
  return {
    id: 'notification-1',
    identityId: 'identity-1',
    title: 'Build finished',
    content: 'The build completed successfully.',
    type: 'SYSTEM',
    topic: null,
    workflowKey: null,
    category: 'System',
    importance: 'Moderate',
    isRead: false,
    readAt: null,
    status: 'Delivered',
    relatedEntityType: null,
    relatedEntityId: null,
    navigationIntent: null,
    actions: null,
    metadata: { outboxId: 'outbox-internal-1', retryCount: 3 },
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    notificationChannels: ['Email'],
    ...overrides,
  } as NotificationClientDTO;
}

function mountItem(overrides: Partial<NotificationClientDTO> = {}) {
  return mount(NotificationItem, {
    props: { notification: createNotification(overrides) },
    global: { plugins: [i18n] },
  });
}

describe('notification semantic controls', () => {
  it('renders a list notification action as a named button', () => {
    const wrapper = mountItem();
    const action = wrapper.get('[data-testid="notification-item"]');

    expect(action.element.tagName).toBe('BUTTON');
    expect(action.attributes('type')).toBe('button');
    expect(action.attributes('aria-label')).toBe('Build finished');
  });

  it('renders a known Task workflow without exposing contract or delivery internals', () => {
    const wrapper = mountItem({
      topic: 'task.reminder',
      workflowKey: 'task.reminder',
      category: 'Task',
      relatedEntityType: 'Task',
      relatedEntityId: 'task-42',
      navigationIntent: { route: '/tasks/task-42' },
    });

    expect(wrapper.text()).toContain('Tasks');
    expect(wrapper.text()).toContain('Task reminder');
    expect(wrapper.text()).toContain('Task');
    expect(wrapper.text()).toContain('Open related item');
    for (const internalValue of [
      'task.reminder',
      'task-42',
      'Delivered',
      'Email',
      'outbox-internal-1',
      'retryCount',
    ]) {
      expect(wrapper.text()).not.toContain(internalValue);
    }
  });

  it('maps a dynamic Routine workflow to stable product wording', () => {
    const wrapper = mountItem({
      topic: 'routine:water-break:notification',
      workflowKey: 'routine:water-break',
      category: 'Reminder',
      relatedEntityType: 'Routine',
      relatedEntityId: 'routine-internal-88',
      navigationIntent: { route: '/notifications' },
    });

    expect(wrapper.text()).toContain('Reminders');
    expect(wrapper.text()).toContain('Routine reminder');
    expect(wrapper.text()).toContain('Routine');
    expect(wrapper.text()).not.toContain('Open related item');
    expect(wrapper.text()).not.toContain('routine:water-break');
    expect(wrapper.text()).not.toContain('routine-internal-88');
  });

  it('falls back to localized category wording for an unknown workflow', () => {
    const wrapper = mountItem({
      topic: 'worker.outbox.email.retry',
      workflowKey: 'worker.outbox.email.retry',
      category: 'System',
      relatedEntityType: null,
      relatedEntityId: 'worker-job-9',
      navigationIntent: null,
    });

    expect(wrapper.text()).toContain('System');
    expect(wrapper.text()).not.toContain('worker.outbox.email.retry');
    expect(wrapper.text()).not.toContain('worker-job-9');
    expect(wrapper.text()).not.toContain('Open related item');
  });

  it('keeps toast content and close as separate named buttons', () => {
    const wrapper = mount(InAppNotification, {
      props: {
        notifications: [
          {
            id: 'toast-1',
            title: 'Reminder due',
            message: 'Stand up and stretch.',
            type: 'REMINDER',
            priority: 'NORMAL',
          },
        ],
      },
      global: {
        plugins: [i18n],
        stubs: { Teleport: true, TransitionGroup: false },
      },
    });
    const buttons = wrapper.findAll('button');

    expect(buttons).toHaveLength(2);
    expect(buttons[0].attributes('aria-label')).toBe('Reminder due');
    expect(buttons[1].attributes('aria-label')).toBe('Close');
  });
});
