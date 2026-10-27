import { beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import {
  installCommonBrowserMocks,
  installVuePiniaTestHarness,
  registerFastTestHooks,
} from '@memoflow/test-utils';

/**
 * Node >= 22 exposes a globalThis.localStorage even without --localstorage-file;
 * that object exists but its getItem/setItem are unusable. Probing the actual
 * read/write behaviour distinguishes a real storage from a dead one, so the
 * public test setup installs a genuine happy-dom Storage whenever the current
 * global is not functional.
 */
function installFunctionalLocalStorage(): void {
  const raw = (globalThis as Record<string, unknown>).localStorage;
  let usable = false;
  if (raw && typeof raw === 'object') {
    try {
      const candidate = raw as Storage;
      if (typeof candidate.getItem === 'function' && typeof candidate.setItem === 'function') {
        const probeKey = '__memoflow_local_storage_probe__';
        candidate.setItem(probeKey, '1');
        usable = candidate.getItem(probeKey) === '1';
        candidate.removeItem(probeKey);
      }
    } catch {
      usable = false;
    }
  }
  if (!usable) {
    (globalThis as Record<string, unknown>).localStorage = new Window().localStorage;
  }
}

installFunctionalLocalStorage();

// Test isolation: the shared Storage persists across tests within one worker.
// Clear it before every test so suites cannot pollute one another.
beforeEach(() => {
  try {
    (globalThis as Record<string, unknown>).localStorage?.clear();
  } catch {
    // Storage unavailable; nothing to isolate.
  }
});

installVuePiniaTestHarness();
registerFastTestHooks({
  timezone: false,
});
installCommonBrowserMocks();
