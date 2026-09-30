import { describe, expect, it, vi } from 'vitest';
import type { TaskGoalBindingDTO } from '@memoflow/contracts/task';
import { instance } from '../components/task-quick-test-fixtures';
import { useTaskOccurrenceActionCoordinator } from './useTaskOccurrenceActionCoordinator';

function setup(binding?: TaskGoalBindingDTO) {
  const result = instance({ status: 'Completed' });
  const operations = {
    completeOccurrence: vi.fn().mockResolvedValue(result),
    uncompleteOccurrence: vi.fn().mockResolvedValue(result),
    markOccurrenceMissed: vi.fn().mockResolvedValue(result),
    skipOccurrence: vi.fn().mockResolvedValue(result),
    setOccurrenceChecklistItem: vi.fn().mockResolvedValue(result),
  };
  const afterSuccess = vi.fn();
  return {
    result,
    operations,
    afterSuccess,
    coordinator: useTaskOccurrenceActionCoordinator({
      operations,
      afterSuccess,
      resolveGoalBinding: () => binding,
    }),
  };
}
describe('occurrence action coordinator', () => {
  it('routes every semantic command and preserves the completion result', async () => {
    const { coordinator: c, operations: o, result, afterSuccess } = setup();
    expect(await c.requestComplete('one')).toBe(result);
    await c.requestUncomplete('two');
    await c.requestMissed('three');
    await c.requestSkip('four');
    await c.requestChecklistChange('five', 'step', true, 7);
    expect(o.completeOccurrence).toHaveBeenCalledWith('one');
    expect(o.uncompleteOccurrence).toHaveBeenCalledWith('two');
    expect(o.markOccurrenceMissed).toHaveBeenCalledWith('three');
    expect(o.skipOccurrence).toHaveBeenCalledWith('four');
    expect(o.setOccurrenceChecklistItem).toHaveBeenCalledWith('five', {
      definitionId: 'step',
      completed: true,
      expectedVersion: 7,
    });
    expect(afterSuccess).toHaveBeenCalledTimes(5);
  });
  it('holds the busy guard through the success refresh and rejects conflicting actions', async () => {
    const { coordinator: c, operations: o, afterSuccess } = setup();
    let release!: () => void;
    afterSuccess.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = c.requestComplete('one');
    expect(c.busyOccurrenceId.value).toBe('one');
    await Promise.resolve();
    expect(await c.requestSkip('two')).toBeNull();
    expect(o.skipOccurrence).not.toHaveBeenCalled();
    release();
    await pending;
    expect(c.busyOccurrenceId.value).toBeNull();
  });
  it('does not refresh failed commands and releases busy state on failure or throw', async () => {
    const { coordinator: c, operations: o, afterSuccess } = setup();
    o.completeOccurrence.mockResolvedValueOnce(null);
    expect(await c.requestComplete('one')).toBeNull();
    o.skipOccurrence.mockRejectedValueOnce(new Error('failed'));
    await expect(c.requestSkip('one')).rejects.toThrow('failed');
    expect(afterSuccess).not.toHaveBeenCalled();
    expect(c.busyOccurrenceId.value).toBeNull();
  });
});

function binding(
  mode: 'Prompt' | 'Fixed' | 'LinkOnly',
  suggestedValue: number | null = null,
): TaskGoalBindingDTO {
  return {
    goalId: 'goal' as TaskGoalBindingDTO['goalId'],
    keyResultId: 'kr' as TaskGoalBindingDTO['keyResultId'],
    contribution: mode === 'Fixed' ? { trigger: 'EachCompletion', value: 5 } : null,
    progressRule:
      mode === 'LinkOnly'
        ? null
        : mode === 'Fixed'
          ? { mode, trigger: 'EachCompletion', value: 5 }
          : { mode, trigger: 'EachCompletion', suggestedValue },
  };
}
describe('completion measurement decision', () => {
  it.each(['Fixed', 'LinkOnly'] as const)('completes %s directly', async (mode) => {
    const { coordinator: c, operations: o, result } = setup(binding(mode));
    expect(await c.requestComplete('one')).toBe(result);
    expect(o.completeOccurrence).toHaveBeenCalledExactlyOnceWith('one');
    expect(c.pendingMeasurement.value).toBeNull();
  });
  it.each([0, -2, null])(
    'opens one Prompt session with suggestion %s without a write',
    async (suggestion) => {
      const { coordinator: c, operations: o } = setup(binding('Prompt', suggestion));
      expect(await c.requestComplete('one')).toBeNull();
      expect(c.pendingMeasurement.value).toEqual({
        occurrenceId: 'one',
        goalId: 'goal',
        keyResultId: 'kr',
        suggestedValue: suggestion,
      });
      expect(c.busyOccurrenceId.value).toBeNull();
      await c.requestComplete('two');
      await c.requestUncomplete('one');
      await c.requestSkip('two');
      expect(c.pendingMeasurement.value?.occurrenceId).toBe('one');
      expect(o.completeOccurrence).not.toHaveBeenCalled();
      expect(o.uncompleteOccurrence).not.toHaveBeenCalled();
      expect(o.skipOccurrence).not.toHaveBeenCalled();
    },
  );
  it('submits the exact signed/zero measurement and clears only after success', async () => {
    const { coordinator: c, operations: o, afterSuccess } = setup(binding('Prompt', 99));
    await c.requestComplete('one');
    o.completeOccurrence.mockResolvedValueOnce(null);
    expect(await c.submitMeasurement(-2, 'actual')).toBeNull();
    expect(c.pendingMeasurement.value?.occurrenceId).toBe('one');
    expect(afterSuccess).not.toHaveBeenCalled();
    o.completeOccurrence.mockRejectedValueOnce(new Error('offline'));
    await expect(c.submitMeasurement(-2, 'actual')).rejects.toThrow('offline');
    expect(c.pendingMeasurement.value).not.toBeNull();
    expect(c.busyOccurrenceId.value).toBeNull();
    await c.submitMeasurement(0, 'zero');
    expect(o.completeOccurrence).toHaveBeenLastCalledWith('one', {
      goalMeasurement: { value: 0, note: 'zero' },
    });
    expect(c.pendingMeasurement.value).toBeNull();
    expect(afterSuccess).toHaveBeenCalledOnce();
    await c.requestUncomplete('one');
    await c.requestComplete('one');
    expect(c.pendingMeasurement.value).not.toBeNull();
    await c.submitMeasurement(-3, 'replacement');
    expect(o.completeOccurrence).toHaveBeenLastCalledWith('one', {
      goalMeasurement: { value: -3, note: 'replacement' },
    });
  });
  it('complete-only sends no measurement, retains failures and clears success/cancel', async () => {
    const { coordinator: c, operations: o } = setup(binding('Prompt', 5));
    await c.requestComplete('one');
    o.completeOccurrence.mockResolvedValueOnce(null);
    await c.completeWithoutMeasurement();
    expect(c.pendingMeasurement.value).not.toBeNull();
    await c.completeWithoutMeasurement();
    expect(o.completeOccurrence).toHaveBeenLastCalledWith('one');
    expect(c.pendingMeasurement.value).toBeNull();
    await c.requestComplete('two');
    c.cancelMeasurement();
    expect(c.pendingMeasurement.value).toBeNull();
    expect(o.completeOccurrence).toHaveBeenCalledTimes(2);
  });
  it('guards duplicate submits, complete-only and cancellation until refresh finishes', async () => {
    const { coordinator: c, operations: o, afterSuccess } = setup(binding('Prompt'));
    let release!: (result: ReturnType<typeof instance>) => void;
    o.completeOccurrence.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    let refresh!: () => void;
    afterSuccess.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          refresh = resolve;
        }),
    );
    await c.requestComplete('one');
    const submitting = c.submitMeasurement(1, '');
    expect(c.busyOccurrenceId.value).toBe('one');
    c.cancelMeasurement();
    expect(c.pendingMeasurement.value).not.toBeNull();
    expect(await c.submitMeasurement(2, '')).toBeNull();
    expect(await c.completeWithoutMeasurement()).toBeNull();
    expect(await c.requestComplete('two')).toBeNull();
    release(instance({ status: 'Completed' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(c.pendingMeasurement.value).toBeNull();
    expect(c.busyOccurrenceId.value).toBe('one');
    refresh();
    await submitting;
    expect(o.completeOccurrence).toHaveBeenCalledOnce();
    expect(c.busyOccurrenceId.value).toBeNull();
  });
  it.each([NaN, Infinity, -Infinity])(
    'rejects non-finite %s without losing the session',
    async (value) => {
      const { coordinator: c, operations: o } = setup(binding('Prompt'));
      await c.requestComplete('one');
      await c.submitMeasurement(value, '');
      expect(o.completeOccurrence).not.toHaveBeenCalled();
      expect(c.pendingMeasurement.value).not.toBeNull();
    },
  );
  it('falls back to direct completion if the Prompt binding has no KR', async () => {
    const { coordinator: c, operations: o } = setup({ ...binding('Prompt'), keyResultId: null });
    await c.requestComplete('one');
    expect(o.completeOccurrence).toHaveBeenCalledExactlyOnceWith('one');
  });
});
