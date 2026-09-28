/** @vitest-environment happy-dom */

import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationClientDTO } from '@memoflow/contracts/notification';
import enNotification from '../../../locales/en-US/notification';
import NotificationListPage from './NotificationListPage.vue';

const viewMocks = vi.hoisted(() => ({
  notifications: { __v_isRef: true, value: [] as NotificationClientDTO[] },
  isLoading: { __v_isRef: true, value: false },
  isError: { __v_isRef: true, value: false },
  error: { __v_isRef: true, value: null as string | null },
  unreadCount: { __v_isRef: true, value: 0 },
  hasUnread: { __v_isRef: true, value: false },
  refetch: vi.fn(async () => undefined),
  markAsRead: {
    mutate: vi.fn(),
    mutateAsync: vi.fn(async () => undefined),
  },
  markAllAsRead: {
    mutateAsync: vi.fn(async () => undefined),
  },
  dismiss: {
    mutateAsync: vi.fn(async () => undefined),
  },
  executeAction: {
    mutateAsync: vi.fn(async () => ({
      interaction: { outcome: 'accepted' },
      action: { actionKey: 'complete' },
    })),
  },
  store: {
    readFilter: 'all' as 'all' | 'unread',
    setReadFilter: vi.fn<(value: 'all' | 'unread') => void>(),
  },
}));

vi.mock('../composables/useNotificationListQuery', () => ({
  useNotificationListQuery: () => ({
    notifications: viewMocks.notifications,
    isLoading: viewMocks.isLoading,
    isError: viewMocks.isError,
    error: viewMocks.error,
    refetch: viewMocks.refetch,
  }),
}));

vi.mock('../composables/useNotificationUnreadQuery', () => ({
  useNotificationUnreadQuery: () => ({
    unreadCount: viewMocks.unreadCount,
    hasUnread: viewMocks.hasUnread,
  }),
}));

vi.mock('../composables/useNotificationMutations', () => ({
  useNotificationMutations: () => ({
    markAsRead: viewMocks.markAsRead,
    markAllAsRead: viewMocks.markAllAsRead,
    dismiss: viewMocks.dismiss,
    executeAction: viewMocks.executeAction,
  }),
}));

vi.mock('../stores/notification-store', () => ({
  useNotificationStore: () => viewMocks.store,
}));

vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@memoflow/ui-vue-shadcn', async () => {
  const { defineComponent, h } = await import('vue');
  const Button = defineComponent({
    name: 'UiButtonStub',
    inheritAttrs: false,
    props: { disabled: Boolean },
    emits: ['click'],
    setup(props, { attrs, emit, slots }) {
      return () =>
        h(
          'button',
          {
            ...attrs,
            disabled: props.disabled,
            type: 'button',
            onClick: () => emit('click'),
          },
          slots.default?.(),
        );
    },
  });
  const passthrough = (name: string) =>
    defineComponent({
      name,
      inheritAttrs: false,
      setup(_, { attrs, slots }) {
        return () => h('div', attrs, slots.default?.());
      },
    });

  return {
    Badge: passthrough('Badge'),
    Button,
    Skeleton: passthrough('Skeleton'),
  };
});

vi.mock('../../../components/shared/ModuleHeader.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'ModuleHeader',
      inheritAttrs: false,
      setup(_, { attrs, slots }) {
        return () => h('header', attrs, [slots.leading?.(), slots.actions?.(), slots.subnav?.()]);
      },
    }),
  };
});

vi.mock('../../../components/shared/AppEmptyState.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'AppEmptyState',
      props: {
        title: String,
        description: String,
        testid: String,
      },
      setup(props) {
        return () =>
          h('section', { 'data-testid': props.testid }, [
            h('h2', props.title),
            h('p', props.description),
          ]);
      },
    }),
  };
});

vi.mock('../components/NotificationList.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'NotificationList',
      props: {
        notifications: { type: Array, default: () => [] },
      },
      emits: ['notification-click', 'mark-read', 'execute-action', 'delete'],
      setup(props, { emit }) {
        return () =>
          h(
            'div',
            { 'data-testid': 'notification-list-stub' },
            (props.notifications as NotificationClientDTO[]).flatMap((notification) => [
              h(
                'button',
                {
                  type: 'button',
                  'data-testid': `notification-click-${notification.id}`,
                  onClick: () => emit('notification-click', notification),
                },
                notification.title,
              ),
              ...(notification.actions ?? [])
                .filter((action) => action.kind === 'owner-command')
                .map((action) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      'data-testid': `notification-action-${notification.id}-${action.actionKey}`,
                      onClick: () =>
                        emit('execute-action', {
                          notificationId: notification.id,
                          actionKey: action.actionKey,
                        }),
                    },
                    action.actionKey,
                  ),
                ),
            ]),
          );
      },
    }),
  };
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      notification: enNotification,
    },
  },
});

function createNotification(overrides: Partial<NotificationClientDTO> = {}): NotificationClientDTO {
  return {
    id: 'notification-1',
    identityId: 'identity-1',
    title: 'Task reminder',
    content: 'Review the task.',
    type: 'TASK',
    topic: 'task.reminder',
    workflowKey: 'task.reminder',
    category: 'Task',
    importance: 'Moderate',
    isRead: false,
    readAt: null,
    status: 'Delivered',
    relatedEntityType: 'Task',
    relatedEntityId: 'task-42',
    navigationIntent: null,
    actions: null,
    metadata: null,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    notificationChannels: null,
    ...overrides,
  } as NotificationClientDTO;
}

async function mountPage() {
  const EmptyRoute = { template: '<div />' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/notifications', component: EmptyRoute },
      { path: '/goals', component: EmptyRoute },
      { path: '/tasks', component: EmptyRoute },
      { path: '/tasks/:id', component: EmptyRoute },
    ],
  });
  await router.push('/notifications');
  await router.isReady();
  const push = vi.spyOn(router, 'push');
  const wrapper = mount(NotificationListPage, {
    global: { plugins: [router, i18n] },
  });
  await flushPromises();
  return { wrapper, router, push };
}

beforeEach(() => {
  viewMocks.notifications.value = [];
  viewMocks.isLoading.value = false;
  viewMocks.isError.value = false;
  viewMocks.error.value = null;
  viewMocks.unreadCount.value = 0;
  viewMocks.hasUnread.value = false;
  viewMocks.store.readFilter = 'all';
  viewMocks.store.setReadFilter.mockImplementation((value) => {
    viewMocks.store.readFilter = value;
  });
  vi.clearAllMocks();
});

describe('NotificationListPage', () => {
  it('renders translated loading, safe error/retry, and empty states', async () => {
    viewMocks.isLoading.value = true;
    let mounted = await mountPage();
    expect(
      mounted.wrapper.get('[data-testid="notification-list-skeleton"]').attributes('aria-label'),
    ).toBe('Loading...');
    mounted.wrapper.unmount();

    viewMocks.isLoading.value = false;
    viewMocks.isError.value = true;
    viewMocks.error.value = 'database host and raw stack detail';
    mounted = await mountPage();
    const errorState = mounted.wrapper.get('[data-testid="notifications-error-state"]');
    expect(errorState.text()).toContain('Failed to load notifications');
    expect(errorState.text()).not.toContain('database host and raw stack detail');
    await mounted.wrapper.get('[data-testid="notifications-retry"]').trigger('click');
    expect(viewMocks.refetch).toHaveBeenCalledTimes(1);
    mounted.wrapper.unmount();

    viewMocks.isError.value = false;
    mounted = await mountPage();
    const emptyState = mounted.wrapper.get('[data-testid="notifications-empty-state"]');
    expect(emptyState.text()).toContain('No notifications');
    expect(emptyState.text()).toContain('You are all caught up.');
  });

  it('marks unread facts as read and gives explicit intent precedence with params', async () => {
    const notification = createNotification({
      id: 'explicit-intent',
      navigationIntent: { route: '/tasks/task-42', params: { view: 'today' } },
    });
    viewMocks.notifications.value = [notification];
    viewMocks.unreadCount.value = 1;
    viewMocks.hasUnread.value = true;
    const { wrapper, push } = await mountPage();

    await wrapper.get('[data-testid="notification-click-explicit-intent"]').trigger('click');
    await flushPromises();

    expect(viewMocks.markAsRead.mutate).toHaveBeenCalledWith('explicit-intent');
    expect(push).toHaveBeenCalledWith({
      path: '/tasks/task-42',
      query: { view: 'today' },
    });
  });

  it('executes Routine typed actions without treating them as read-state mutations', async () => {
    const notification = createNotification({
      id: 'routine-reminder',
      workflowKey: 'routine.intervention',
      category: 'Reminder',
      relatedEntityType: 'Routine',
      relatedEntityId: 'routine-1',
      actions: [
        {
          kind: 'owner-command',
          actionKey: 'complete',
          labelKey: 'routine.action.complete',
          owner: { type: 'routine-occurrence', id: 'occurrence-1' },
          commandKey: 'routine.complete',
          input: { routineId: 'routine-1', occurrenceKey: 'occurrence-1' },
        },
      ],
    });
    viewMocks.notifications.value = [notification];
    const { wrapper } = await mountPage();

    await wrapper
      .get('[data-testid="notification-action-routine-reminder-complete"]')
      .trigger('click');
    await flushPromises();

    expect(viewMocks.executeAction.mutateAsync).toHaveBeenCalledWith({
      notificationId: 'routine-reminder',
      actionKey: 'complete',
    });
    expect(viewMocks.markAsRead.mutate).not.toHaveBeenCalled();
  });

  it('uses category fallback and contains rejected web navigation', async () => {
    const goalNotification = createNotification({
      id: 'goal-fallback',
      category: 'GOAL',
      isRead: true,
      navigationIntent: null,
    });
    viewMocks.notifications.value = [goalNotification];
    const { wrapper, push } = await mountPage();

    await wrapper.get('[data-testid="notification-click-goal-fallback"]').trigger('click');
    await flushPromises();
    expect(viewMocks.markAsRead.mutate).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith({ path: '/goals' });

    push.mockRejectedValueOnce(new Error('raw router failure'));
    await expect(
      wrapper.get('[data-testid="notification-click-goal-fallback"]').trigger('click'),
    ).resolves.toBeUndefined();
    await flushPromises();
    expect(wrapper.text()).not.toContain('raw router failure');
  });

  it('preserves Notification Center toolbar, filters, and scroll-host contracts', async () => {
    const { wrapper } = await mountPage();

    expect(wrapper.get('[data-testid="notification-center"]')).toBeTruthy();
    expect(wrapper.get('[data-testid="notification-page-toolbar"]')).toBeTruthy();
    expect(wrapper.get('[data-testid="notification-filter-all"]')).toBeTruthy();
    expect(wrapper.get('[data-testid="notification-filter-unread"]')).toBeTruthy();
    expect(
      wrapper.get('[data-testid="notification-scroll-host"]').attributes('data-scroll-host'),
    ).toBe('notification');
  });
});
