/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import type { GoalClientDTO } from '@memoflow/contracts/goal';
import { requireYmd } from '@memoflow/contracts/primitives';
import { ActionableWrapper, type MenuAction } from '../../../components/shared';
import GoalProgressRow from './GoalProgressRow.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { edit: 'Edit', delete: 'Delete' },
      goal: {
        list: {
          pastTarget: 'Past Target',
          completed: 'Completed',
          abandoned: 'Abandoned',
          target: 'Target',
          from: 'From',
          keyResultsColumn: 'Key results',
          moreActions: 'More goal actions',
        },
        cards: { keyResultsCount: '{done}/{total} key results' },
      },
    },
  },
});

function goal(overrides: Partial<GoalClientDTO> = {}): GoalClientDTO {
  return {
    id: 'goal-1',
    identityId: 'identity-1',
    name: 'Ship MemoFlow vNext',
    summary: null,
    status: 'InProgress',
    start: { kind: 'day', date: requireYmd('2026-08-25') },
    target: { kind: 'day', date: requireYmd('2026-09-30') },
    completedAt: null,
    archivedAt: null,
    sortOrder: 0,
    reminderConfig: null,
    labels: [
      {
        id: 'work',
        identityId: 'identity-1',
        name: 'Work',
        normalizedName: 'work',
        color: '#3366ff',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'ai',
        identityId: 'identity-1',
        name: 'AI',
        normalizedName: 'ai',
        color: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    version: 1,
    keyResults: [],
    reviews: [],
    totalKeyResults: 3,
    completedKeyResults: 1,
    overallProgress: 64,
    ...overrides,
  } as GoalClientDTO;
}

describe('GoalProgressRow (GOAL-5101)', () => {
  it('renders the high-density progress row information hierarchy', () => {
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));
    const wrapper = mount(GoalProgressRow, {
      props: { goal: goal() },
      global: { plugins: [i18n] },
    });
    expect(wrapper.get('[data-testid="goal-row-title"]').text()).toBe('Ship MemoFlow vNext');
    expect(wrapper.text()).toContain('64%');
    expect(wrapper.text()).toContain('#Work');
    expect(wrapper.text()).toContain('#AI');
    expect(wrapper.get('[data-testid="goal-row-key-results"]').text()).toBe('1 / 3');
    expect(wrapper.get('[data-testid="goal-row-target"]').text()).toContain('2026-09-30');
    expect(wrapper.get('[data-testid="goal-row-progress"]').text()).toContain('64%');
    expect(wrapper.get('[data-testid="goal-row-progress"]').classes()).toContain(
      'grid-cols-[2.5rem_5rem]',
    );
    expect(wrapper.find('[data-testid="goal-card"]').exists()).toBe(false);
    vi.useRealTimers();
  });

  it('moves edit/delete into the shared hover and context action menu', () => {
    const wrapper = mount(GoalProgressRow, {
      props: { goal: goal() },
      global: { plugins: [i18n] },
    });

    const actionable = wrapper.getComponent(ActionableWrapper);
    expect(actionable.props('moreButtonPosition')).toBe('center-right');
    expect(actionable.props('moreButtonLabel')).toBe('More goal actions');

    const actions = actionable.props('actions') as MenuAction[];
    expect(actions.map((action) => action.key)).toEqual(['edit', 'delete']);
    expect(actions[1]?.destructive).toBe(true);

    actions[0]?.handler();
    actions[1]?.handler();
    expect(wrapper.emitted('edit')).toHaveLength(1);
    expect(wrapper.emitted('delete')).toHaveLength(1);
  });

  it('derives Past Target display without persisting a lifecycle status', () => {
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));
    const wrapper = mount(GoalProgressRow, {
      props: {
        goal: goal({
          target: { kind: 'day', date: requireYmd('2026-08-20') },
          status: 'InProgress',
        }),
      },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('Past Target');
    vi.useRealTimers();
  });
});
