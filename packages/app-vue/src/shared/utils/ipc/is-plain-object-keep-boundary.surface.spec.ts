import { describe, expect, it } from 'vitest';
import { sanitizeForIpc } from './sanitize-for-ipc';

/**
 * Residual 1139: isPlainObject / isRecord keep-boundary.
 * - sanitize-for-ipc isPlainObject: Object.getPrototypeOf strict (Object.prototype | null only)
 * - desktop http-envelope isRecord: any non-null object (arrays allowed)
 * - the former app-vue AI isRecord helper is retired with the AgentHost workflow payload path
 * Soft residual 947: desktop local isRecord duals retired onto the package sole.
 * Structural locks: app-vue-source-locks.json#is-plain-object-keep-boundary.
 * Does not flip §13.2 checkboxes.
 */
describe('isPlainObject/isRecord keep-boundary (residual 1139)', () => {
  it('runtime: sanitize path stays IPC-safe without depending on the retired AI helper', () => {
    class Demo {
      x = 1;
    }
    // sanitizeForIpc still produces plain data for both plain objects and class instances
    expect(sanitizeForIpc({ a: 1 })).toEqual({ a: 1 });
    expect(sanitizeForIpc(new Demo())).toEqual({ x: 1 });
    expect(Array.isArray(sanitizeForIpc([1, 2]))).toBe(true);
  });
});
