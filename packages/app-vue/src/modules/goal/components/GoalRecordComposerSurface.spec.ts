import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from '@memoflow/ui-vue-shadcn';
import GoalRecordComposerSurface from './GoalRecordComposerSurface.vue';
import enUS from '../../../locales/en-US';
import { KeyResultCalculationMethod } from '@memoflow/contracts/goal';
const owner = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../composables/useGoal', () => ({
  useGoal: () => ({ getKeyResultById: () => undefined, getGoalRecordPreviewContext: owner.read }),
}));
function context(method: KeyResultCalculationMethod = 'Sum') {
  return {
    keyResultId: 'kr',
    aggregationMethod: method,
    unit: 'kg',
    initialValue: 0,
    currentValue: 40,
    trackingBaseValue: 40,
    targetValue: 100,
    aggregationSnapshot: { count: 0, sum: 0, min: null, max: null, last: null },
  };
}
function composer(initialValue: number | null = null) {
  return mount(GoalRecordComposerSurface, {
    props: { goalId: 'goal', keyResultId: 'kr', initialValue },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
    },
  });
}
beforeEach(() => {
  owner.read.mockReset();
  owner.read.mockResolvedValue(context());
});
describe('Goal owned composer', () => {
  it.each(Object.values(KeyResultCalculationMethod))(
    'uses authoritative %s vocabulary without a cached KR',
    async (method) => {
      owner.read.mockResolvedValue(context(method));
      const w = composer(0);
      await flushPromises();
      expect(owner.read).toHaveBeenCalledExactlyOnceWith('goal', 'kr');
      expect(w.get('label[for="change-amount"]').text()).toBe(
        method === 'Sum' ? 'Change this time' : 'Recorded value',
      );
      expect(w.text()).toContain('kg');
      expect(w.getComponent(Input).props('modelValue')).toBe(0);
      await w.get('form').trigger('submit');
      expect(w.emitted('submit')).toEqual([[{ value: 0, note: '' }]]);
      await w.get('#change-amount').setValue('-5');
      expect(w.get('[data-testid="goal-record-preview"]').text()).toContain(
        method === 'Sum' ? '35' : '-5',
      );
      await w.get('#record-note').setValue('actual');
      await w.get('#change-amount').trigger('keydown', { key: 'Enter' });
      expect(w.emitted('submit')?.[1]).toEqual([{ value: -5, note: 'actual' }]);
      expect(owner.read).toHaveBeenCalledOnce();
      w.unmount();
    },
  );
  it.each([0, -4, null])('prefills suggested %s but leaves it editable', async (value) => {
    const w = composer(value);
    await flushPromises();
    expect(w.getComponent(Input).props('modelValue')).toBe(value ?? '');
    await w.get('#change-amount').setValue('7');
    await w.get('form').trigger('submit');
    expect(w.emitted('submit')).toEqual([[{ value: 7, note: '' }]]);
    w.unmount();
  });
  it.each(['null', 'throw'])(
    'shows unavailable owner read (%s) without emitting persistence',
    async (failure) => {
      if (failure === 'null') owner.read.mockResolvedValue(null);
      else owner.read.mockRejectedValue(new Error('offline'));
      const w = composer(1);
      await flushPromises();
      expect(w.text()).toContain('Preview unavailable');
      await w.get('form').trigger('submit');
      expect(w.emitted('submit')).toBeUndefined();
      expect(w.emitted('validity-change')?.at(-1)).toEqual([false]);
      w.unmount();
    },
  );
  it('ignores multiline/composing Enter and prevents invalid/disabled submissions; Escape cancels', async () => {
    const w = composer();
    await flushPromises();
    await w.get('#change-amount').trigger('keydown', { key: 'Enter' });
    await w.get('#change-amount').setValue('2');
    await w.get('#record-note').trigger('keydown', { key: 'Enter' });
    await w.get('#change-amount').trigger('keydown', { key: 'Enter', isComposing: true });
    expect(w.emitted('submit')).toBeUndefined();
    await w.setProps({ disabled: true });
    await w.get('form').trigger('submit');
    await w.get('#change-amount').trigger('keydown', { key: 'Escape' });
    expect(w.emitted('cancel')).toBeUndefined();
    await w.setProps({ disabled: false });
    await w.get('#change-amount').trigger('keydown', { key: 'Escape' });
    expect(w.emitted('cancel')).toEqual([[]]);
    w.unmount();
  });
});
