/**
 * Generic repository mock factory
 *
 * Creates lightweight proxy-based mocks for domain repository interfaces.
 * Instead of mocking the ORM layer, we mock the domain repository interface
 * directly — lightweight and focused on the contract under test.
 *
 * @example
 * ```typescript
 * const mockRepo = createMockRepo<ITaskPlanRepository>({
 *   findById: vi.fn().mockResolvedValue(aTaskPlan),
 *   save: vi.fn().mockResolvedValue(undefined),
 * });
 *
 * const useCase = new CreateTaskPlan(mockRepo, mockInstanceRepo);
 * ```
 */

import { vi, type Mock } from 'vitest';

/**
 * Create a mock implementation of a repository interface.
 *
 * Any method NOT explicitly provided in `overrides` will default to a
 * `vi.fn()` that returns `undefined` (or `Promise<undefined>` if awaited).
 * This means you only need to specify the methods your test actually exercises.
 *
 * @param overrides - Partial mock implementations for specific methods
 * @returns A proxy object typed as T, with all methods as vi.fn() mocks
 */
export function createMockRepo<T extends object>(
  overrides: Partial<Record<keyof T, Mock | ((...args: unknown[]) => unknown)>> = {},
): T {
  const cache = new Map<string | symbol, Mock>();

  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      // Return explicit override if provided
      if (prop in overrides) {
        return overrides[prop as keyof T];
      }

      // Return a cached vi.fn() for any accessed method
      if (!cache.has(prop)) {
        cache.set(prop, vi.fn());
      }
      return cache.get(prop);
    },
  };

  return new Proxy<T>({} as unknown as T, handler);
}

/**
 * Create a mock event bus
 *
 * @example
 * ```typescript
 * const eventBus = createMockEventBus();
 * // ... run operation that publishes events ...
 * expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'TaskCompleted' }));
 * ```
 */
export function createMockEventBus() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
}
