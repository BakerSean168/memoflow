import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerInfo, taskEventBus } = vi.hoisted(() => ({
  taskEventBus: {
    on: vi.fn(),
    off: vi.fn(),
  },
  loggerInfo: vi.fn(),
}));

vi.mock('@memoflow/utils/domain', () => ({
  eventBus: taskEventBus,
  createTypedEventSubscriber: (source: typeof taskEventBus) => ({
    on: source.on,
    off: source.off,
  }),
}));

vi.mock('@memoflow/utils/logger', () => ({
  createLogger: () => ({
    info: loggerInfo,
  }),
}));

import { createTaskRuntimeContribution } from './task.runtime';

describe('createTaskRuntimeContribution', () => {
  beforeEach(() => {
    taskEventBus.on.mockClear();
    taskEventBus.off.mockClear();
    loggerInfo.mockClear();
  });

  it('registers typed task event handlers on start', () => {
    const runtime = createTaskRuntimeContribution();

    runtime.start();

    expect(taskEventBus.on).toHaveBeenCalledTimes(4);
    expect(taskEventBus.on).toHaveBeenNthCalledWith(
      1,
      'task:occurrence-generated',
      expect.any(Function),
    );
    expect(taskEventBus.on).toHaveBeenNthCalledWith(
      2,
      'task:occurrence-completed',
      expect.any(Function),
    );
    expect(taskEventBus.on).toHaveBeenNthCalledWith(
      3,
      'task:occurrence-skipped',
      expect.any(Function),
    );
    expect(taskEventBus.on).toHaveBeenNthCalledWith(
      4,
      'task:occurrence-deleted',
      expect.any(Function),
    );
  });

  it('does not register twice when start is called repeatedly', () => {
    const runtime = createTaskRuntimeContribution();

    runtime.start();
    runtime.start();

    expect(taskEventBus.on).toHaveBeenCalledTimes(4);
  });

  it('unregisters the same handlers on stop', () => {
    const runtime = createTaskRuntimeContribution();

    runtime.start();
    runtime.stop();

    expect(taskEventBus.off).toHaveBeenCalledTimes(4);
    expect(taskEventBus.off).toHaveBeenNthCalledWith(
      1,
      'task:occurrence-generated',
      expect.any(Function),
    );
    expect(taskEventBus.off).toHaveBeenNthCalledWith(
      2,
      'task:occurrence-completed',
      expect.any(Function),
    );
    expect(taskEventBus.off).toHaveBeenNthCalledWith(
      3,
      'task:occurrence-skipped',
      expect.any(Function),
    );
    expect(taskEventBus.off).toHaveBeenNthCalledWith(
      4,
      'task:occurrence-deleted',
      expect.any(Function),
    );
  });
});
