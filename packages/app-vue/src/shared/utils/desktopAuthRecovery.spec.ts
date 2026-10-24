import { describe, expect, it, vi } from 'vitest';
import {
  ensureDesktopAuthReadyWithApi,
  isDesktopAuthRecoverable,
  recoverDesktopAuthIfNeeded,
} from './desktop-auth-recovery';

describe('desktopAuthRecovery', () => {
  it('recognizes recoverable desktop auth errors', () => {
    expect(isDesktopAuthRecoverable({ code: 'AUTH_REQUIRED' })).toBe(true);
    expect(isDesktopAuthRecoverable({ code: 'AUTH_RESTORING' })).toBe(true);
    expect(isDesktopAuthRecoverable({ code: 'UNAUTHORIZED' })).toBe(false);
    expect(isDesktopAuthRecoverable(undefined)).toBe(false);
  });

  it('reports readiness from the local Profile access snapshot', async () => {
    const invoke = vi.fn().mockResolvedValueOnce({
      ok: true,
      data: { unlockState: 'UNLOCKED' },
    });

    await expect(
      ensureDesktopAuthReadyWithApi({ invoke }, 'DesktopAuthRecoveryTest'),
    ).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('skips auth recovery for non-auth errors', async () => {
    const invoke = vi.fn();

    await expect(
      recoverDesktopAuthIfNeeded({ code: 'INTERNAL_ERROR' }, { invoke }, 'DesktopAuthRecoveryTest'),
    ).resolves.toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
