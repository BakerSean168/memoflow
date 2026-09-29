import { describe, expect, it, vi } from 'vitest';
import { instance } from '../components/task-quick-test-fixtures';
import { useTaskOccurrenceActionCoordinator } from './useTaskOccurrenceActionCoordinator';

function setup() {
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
    coordinator: useTaskOccurrenceActionCoordinator({ operations, afterSuccess }),
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
