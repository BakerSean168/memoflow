/**
 * Repository Mock 工厂
 *
 * 提供各模块 Repository 的模拟实现
 */

import { vi } from 'vitest';
import { Goal } from '@memoflow/goal/client';
import { GoalStatus, type GoalServerDTO, type GoalId } from '@memoflow/contracts/goal';
import type { IdentityId } from '@memoflow/contracts/primitives';

// ===== Goal Repository Mock =====

export interface MockGoalRepository {
  save: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findByAccountId: ReturnType<typeof vi.fn>;
  findByFolderId: ReturnType<typeof vi.fn>;
  findByStatus: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
}

export function createMockGoalRepository(): MockGoalRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByAccountId: vi.fn().mockResolvedValue([]),
    findByFolderId: vi.fn().mockResolvedValue([]),
    findByStatus: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
  };
}

// ===== Task Repository Mocks =====

export interface MockTaskPlanRepository {
  save: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findByGoalId: ReturnType<typeof vi.fn>;
  findByAccountId: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
}

export function createMockTaskPlanRepository(): MockTaskPlanRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByGoalId: vi.fn().mockResolvedValue([]),
    findByAccountId: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
  };
}

export interface MockTaskOccurrenceRepository {
  save: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findByTemplateId: ReturnType<typeof vi.fn>;
  findByAccountId: ReturnType<typeof vi.fn>;
  findByDateRange: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
}

export function createMockTaskOccurrenceRepository(): MockTaskOccurrenceRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByTemplateId: vi.fn().mockResolvedValue([]),
    findByAccountId: vi.fn().mockResolvedValue([]),
    findByDateRange: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
  };
}

// ===== Setting Repository Mocks =====

export interface MockSettingRepository {
  save: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findByKey: ReturnType<typeof vi.fn>;
  findByScope: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
}

export function createMockSettingRepository(): MockSettingRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByKey: vi.fn().mockResolvedValue(null),
    findByScope: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
  };
}

// ===== Test Data Factories =====

let goalCounter = 0;

export function createMockGoalDTO(overrides: Partial<GoalServerDTO> = {}): GoalServerDTO {
  goalCounter++;
  const now = Date.now();
  return {
    id: `goal-${goalCounter}-${now}` as unknown as GoalId,
    identityId: 'test-account-uuid' as unknown as IdentityId,
    name: `Test Goal ${goalCounter}`,
    summary: 'Test goal summary',
    status: GoalStatus.InProgress,
    startDate: null,
    target: null,
    completedAt: null,
    archivedAt: null,
    sortOrder: goalCounter,
    reminderConfig: null,
    keyResults: [],
    weightSnapshots: [],
    goalReviews: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

export function createMockGoal(overrides: Partial<GoalServerDTO> = {}): Goal {
  const dto = createMockGoalDTO(overrides);
  return Goal.load({
    id: dto.id,
    identityId: dto.identityId,
    name: dto.name,
    summary: dto.summary,
    status: dto.status,
    startDate: dto.startDate ?? null,
    target: dto.target ?? null,
    completedAt: dto.completedAt ?? null,
    archivedAt: dto.archivedAt ?? null,
    sortOrder: dto.sortOrder,
    reminderConfig: null,
    labels: [],
    keyResults: [],
    reviews: [],
    totalKeyResults: 0,
    completedKeyResults: 0,
    overallProgress: 0,
    version: dto.version,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt ?? null,
  });
}

/**
 * 重置所有计数器（在 beforeEach 中调用）
 */
export function resetMockCounters(): void {
  goalCounter = 0;
}
