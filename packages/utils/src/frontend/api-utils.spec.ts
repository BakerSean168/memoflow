import { afterEach, expect, it, vi } from 'vitest';
import { delay, formatFileSize } from './api-utils';

afterEach(() => vi.useRealTimers());

it('formats zero and binary file-size units', () => {
  expect([0, 1024, 1536, 1048576].map(formatFileSize)).toEqual(['0 Bytes', '1 KB', '1.5 KB', '1 MB']);
});

it('resolves delay only after the requested duration', async () => {
  vi.useFakeTimers();
  const complete = vi.fn();
  const pending = delay(20).then(complete);
  await vi.advanceTimersByTimeAsync(19);
  expect(complete).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(complete).toHaveBeenCalledOnce();
});
