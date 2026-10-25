import { vi } from 'vitest';
export { createTestPinia, mountWithPinia } from '@memoflow/test-utils';

/**
 * 创建 mock 应用服务
 */
export function createMockApplicationService() {
  return {
    // 通用方法
    initialize: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),

    // CRUD 操作
    create: vi.fn().mockResolvedValue({ success: true }),
    update: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    getById: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue([]),

    // 查询操作
    search: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  };
}

/**
 * 创建 mock store
 */
export function createMockStore(initialState: Record<string, unknown> = {}) {
  return {
    ...initialState,
    $reset: vi.fn(),
    $patch: vi.fn(),
    $subscribe: vi.fn(),
    $dispose: vi.fn(),
  };
}

/**
 * 创建 mock 实体
 */
export function createMockEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mock-uuid',
    name: 'Mock Entity',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * 创建 mock 路由器
 */
export function createMockRouter() {
  return {
    push: vi.fn().mockResolvedValue(undefined),
    replace: vi.fn().mockResolvedValue(undefined),
    go: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    beforeEach: vi.fn(),
    afterEach: vi.fn(),
    currentRoute: {
      value: {
        path: '/mock-path',
        name: 'MockRoute',
        params: {},
        query: {},
        hash: '',
        fullPath: '/mock-path',
        matched: [],
        meta: {},
        redirectedFrom: undefined,
      },
    },
  };
}

/**
 * 异步测试工具 - 等待下一个 tick
 */
export async function nextTick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 模拟时间工具
 */
export function mockTime(date: string | Date = '2025-09-25T10:00:00Z') {
  const mockDate = new Date(date);
  vi.setSystemTime(mockDate);
  return mockDate;
}

/**
 * 恢复时间
 */
export function restoreTime() {
  vi.useRealTimers();
}
