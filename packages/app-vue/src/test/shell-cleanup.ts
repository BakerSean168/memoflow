import { enableAutoUnmount } from '@vue/test-utils';
import { afterEach, beforeEach, vi } from 'vitest';

/** Install once per shell spec; teardown also runs after failed or timed-out cases. */
export function installShellTestCleanup(): void {
  const browserProperties = ['innerWidth', 'innerHeight', 'matchMedia', 'confirm'] as const;
  let originals: Array<{ descriptor: PropertyDescriptor | undefined; value: unknown }> = [];

  beforeEach(() => {
    originals = browserProperties.map((key) => ({
      descriptor: Object.getOwnPropertyDescriptor(window, key),
      value: window[key],
    }));
  });

  enableAutoUnmount((unmount) => {
    afterEach(() => {
      try {
        // Release component-owned commands, listeners and router hooks before
        // restoring the browser APIs their teardown may still need.
        unmount();
      } finally {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        if (vi.isFakeTimers()) vi.clearAllTimers();
        vi.useRealTimers();
        browserProperties.forEach((key, index) => {
          const { descriptor, value } = originals[index];
          // Vitest's browser globals use accessors backed by an override map;
          // restoring the descriptor alone leaves assignments in that map.
          descriptor?.set?.call(window, value);
          if (descriptor) Object.defineProperty(window, key, descriptor);
          else Reflect.deleteProperty(window, key);
        });
      }
    });
  });
}
