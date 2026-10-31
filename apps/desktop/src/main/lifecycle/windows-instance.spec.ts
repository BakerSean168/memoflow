import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'electron';
import { claimWindowsInstance } from './windows-instance';

describe('Windows single instance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    app.removeAllListeners('second-instance');
  });
  it('restores the existing instance instead of opening another Profile worker', () => {
    const restore = vi.fn();
    expect(claimWindowsInstance({ ...app, isPackaged: true }, restore, 'win32')).toBe(true);
    app.emit('second-instance');
    expect(restore).toHaveBeenCalledTimes(1);
  });
  it('exits the secondary process before startup', () => {
    vi.mocked(app.requestSingleInstanceLock).mockReturnValueOnce(false);
    expect(claimWindowsInstance({ ...app, isPackaged: true }, vi.fn(), 'win32')).toBe(false);
    expect(app.exit).toHaveBeenCalledWith(0);
  });
  it.each([
    { platform: 'linux' as const, isPackaged: true },
    { platform: 'win32' as const, isPackaged: false },
  ])('preserves development and other-platform isolation: %o', ({ platform, isPackaged }) => {
    expect(claimWindowsInstance({ ...app, isPackaged }, vi.fn(), platform)).toBe(true);
    expect(app.requestSingleInstanceLock).not.toHaveBeenCalled();
  });
});
