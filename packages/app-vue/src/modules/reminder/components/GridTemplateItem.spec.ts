/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import type { ReminderTemplateClientDTO } from '@memoflow/contracts/reminder';
import GridTemplateItem from './GridTemplateItem.vue';

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
      reminder: {
        lifecycle: {
          sourceGlobal: 'Controlled by the master switch',
          sourceProfile: 'Paused by the Profile gate; Routine state preserved',
          sourceRoutineInProfile: 'Routine-owned state inside a Profile',
          sourceRoutineWithoutProfile: 'Routine-owned state without a Profile',
        },
        schedule: {
          trigger: 'Trigger time',
          nextTrigger: 'Next trigger',
          recurrence: 'Recurrence',
          daily: 'Daily',
          oneTime: 'One time',
          everyMinutes: 'Every {minutes} minutes',
          notConfigured: 'No recurrence configured',
          noNextTrigger: 'No next trigger scheduled',
          state: {
            upcoming: 'Upcoming',
            missed: 'Missed',
            paused: 'Paused',
            failed: 'Last trigger failed',
            unscheduled: 'Not scheduled',
          },
        },
        templateDetail: {
          triggerSummaryTime: 'At {time}',
          triggerSummaryInterval: 'Every {minutes} minutes',
          notConfigured: 'Not configured',
        },
      },
    },
  },
});

function createTemplate(
  overrides: Partial<ReminderTemplateClientDTO> = {},
): ReminderTemplateClientDTO {
  return {
    id: 'template-1' as ReminderTemplateClientDTO['id'],
    identityId: 'identity-1' as ReminderTemplateClientDTO['identityId'],
    name: 'Morning review',
    description: null,
    type: 'Recurring',
    trigger: {
      type: 'FixedTime',
      fixedTime: { time: '09:00', timezone: null },
      interval: null,
    },
    activeTime: { activatedAt: Date.now() - 60_000 },
    activeHours: null,
    notificationConfig: {
      channels: ['InApp'],
      title: null,
      body: null,
      sound: null,
      vibration: null,
      actions: null,
    },
    selfEnabled: true,
    status: 'Active',
    effectiveEnabled: true,
    groupId: 'group-1' as ReminderTemplateClientDTO['groupId'],
    groupName: 'Focus',
    importanceLevel: 'Moderate',
    tags: [],
    color: null,
    icon: null,
    nextTriggerAt: Date.now() + 60 * 60 * 1000,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    history: null,
    isActive: true,
    isPaused: false,
    controlledByGroup: true,
    lifecycleSource: 'group',
    effectiveEnabledReason: 'The group currently controls this reminder.',
    groupEnabled: true,
    globalReminderEnabled: true,
    ...overrides,
  } as ReminderTemplateClientDTO;
}

function mountItem(item: ReminderTemplateClientDTO) {
  return mount(GridTemplateItem, {
    props: { item },
    global: { plugins: [i18n] },
  });
}

describe('GridTemplateItem schedule hierarchy', () => {
  it('exposes the card action as a named keyboard-focusable button', () => {
    const wrapper = mountItem(createTemplate());
    const card = wrapper.get('[data-testid="reminder-template-card"]');

    expect(card.element.tagName).toBe('BUTTON');
    expect(card.attributes('type')).toBe('button');
    expect(card.attributes('aria-label')).toBe('Morning review');
  });

  it('shows trigger, next trigger, recurrence, and state before control-source metadata', () => {
    const wrapper = mountItem(createTemplate());

    expect(wrapper.get('[data-testid="reminder-trigger-summary"]').text()).toContain('At 09:00');
    expect(wrapper.get('[data-testid="reminder-next-trigger"]').text()).not.toBe('');
    expect(wrapper.get('[data-testid="reminder-recurrence"]').text()).toBe('Daily');
    expect(wrapper.get('[data-testid="reminder-schedule-state"]').text()).toBe('Upcoming');
    expect(wrapper.get('[data-testid="reminder-control-source"]').text()).toContain('Focus');
    expect(wrapper.text().indexOf('Trigger time')).toBeLessThan(
      wrapper.text().indexOf('Paused by the Profile gate; Routine state preserved'),
    );
  });

  it.each([
    {
      expected: 'Paused',
      overrides: { effectiveEnabled: false },
    },
    {
      expected: 'Missed',
      overrides: { nextTriggerAt: Date.now() - 60_000 },
    },
    {
      expected: 'Last trigger failed',
      overrides: {
        history: [
          {
            id: 'history-1',
            templateId: 'template-1',
            triggeredAt: Date.now() - 30_000,
            result: 'Failed',
            error: 'Notification provider unavailable',
            notificationSent: false,
            notificationChannels: ['InApp'],
            version: 1,
            createdAt: Date.now() - 30_000,
            updatedAt: Date.now() - 30_000,
            deletedAt: null,
          },
        ],
      },
    },
  ])('renders the explicit $expected schedule state', ({ expected, overrides }) => {
    const wrapper = mountItem(createTemplate(overrides as Partial<ReminderTemplateClientDTO>));

    expect(wrapper.get('[data-testid="reminder-schedule-state"]').text()).toBe(expected);
  });
});
