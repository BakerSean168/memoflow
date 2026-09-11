/**
 * Goal Module - Mock Generators
 *
 * Provides factory functions for generating realistic mock data
 * that conforms to the Goal module contracts.
 *
 * Usage:
 * ```ts
 * import { createMockGoal, createMockGoalList } from '@memoflow/contracts/mocks';
 * const goal = createMockGoal({ name: 'Custom Goal' });
 * const goals = createMockGoalList(5);
 * ```
 */

import { faker } from '@faker-js/faker';
import type { GoalClientDTO } from '../modules/goal/aggregates/goal-client';
import type { KeyResultClientDTO } from '../modules/goal/entities/key-result-client';
import type { GoalRecordClientDTO } from '../modules/goal/aggregates/goal-record-client';
import type { GoalReviewClientDTO } from '../modules/goal/entities/goal-review-client';
import type {
  GoalAggregateReadModel,
  GoalMutationReceipt,
  QueryGoalsRes,
} from '../modules/goal/api/response-schemas';
import type { KeyResultId } from '../primitives';

// ============================================================================
// GoalClientDTO
// ============================================================================

/**
 * Creates a single mock GoalClientDTO.
 * Pass overrides to customise specific fields.
 */
export function createMockGoal(overrides: Partial<GoalClientDTO> = {}): GoalClientDTO {
  const now = Date.now();
  const id = `IGoalId_${faker.string.uuid()}` as GoalClientDTO['id'];
  const identityId = `IdentityId_${faker.string.uuid()}` as GoalClientDTO['identityId'];

  return {
    id,
    identityId,
    name: faker.lorem.words({ min: 2, max: 5 }),
    summary: faker.datatype.boolean() ? faker.lorem.sentence().slice(0, 500) : null,
    status: faker.helpers.arrayElement([
      'Planned',
      'InProgress',
      'Completed',
      'Abandoned',
    ] as const),
    startDate: faker.datatype.boolean() ? faker.date.past({ years: 1 }).getTime() : null,
    dueDate: faker.datatype.boolean() ? faker.date.future({ years: 1 }).getTime() : null,
    completedAt: null,
    archivedAt: null,
    sortOrder: faker.number.int({ min: 0, max: 1000 }),
    reminderConfig: null,
    labels: [],
    createdAt: now - faker.number.int({ min: 0, max: 30 * 24 * 60 * 60 * 1000 }),
    updatedAt: now,
    deletedAt: null,
    version: 1,
    keyResults: null,
    reviews: null,
    totalKeyResults: 0,
    completedKeyResults: 0,
    overallProgress: 0,
    ...overrides,
  };
}

/**
 * Creates an array of mock GoalClientDTO objects.
 */
export function createMockGoalList(
  count = 5,
  overrides: Partial<GoalClientDTO> = {},
): GoalClientDTO[] {
  return Array.from({ length: count }, () => createMockGoal(overrides));
}

/**
 * Creates the canonical command response used by every Goal mutation.
 * Keeping this in contracts prevents MSW, adapter, and application tests from
 * drifting back to the retired convention of returning a bare Goal snapshot.
 */
export function createMockGoalMutationReceipt(
  goalOverrides: Partial<GoalClientDTO> = {},
  receiptOverrides: Partial<GoalMutationReceipt> = {},
): GoalMutationReceipt {
  const keyResults = goalOverrides.keyResults ?? [];
  const reviews = goalOverrides.reviews ?? [];
  const readModel: GoalAggregateReadModel = {
    ...createMockGoal(goalOverrides),
    keyResults,
    reviews,
  };

  return {
    goalId: readModel.id,
    goalVersion: readModel.version,
    affectedEntityIds: {
      goalIds: [readModel.id],
      keyResultIds: [],
      recordIds: [],
      reviewIds: [],
    },
    readModel,
    ...receiptOverrides,
  };
}

/**
 * Creates a paginated mock response for the goals list endpoint.
 */
export function createMockQueryGoalsRes(count = 5, total?: number): QueryGoalsRes {
  const goals = createMockGoalList(count);
  const totalCount = total ?? count;

  return {
    data: goals,
    pagination: {
      page: 1,
      pageSize: 20,
      total: totalCount,
      hasMore: totalCount > count,
      totalPages: Math.ceil(totalCount / 20),
    },
  };
}

// ============================================================================
// KeyResultClientDTO
// ============================================================================

export function createMockKeyResult(
  overrides: Partial<KeyResultClientDTO> = {},
): KeyResultClientDTO {
  const now = Date.now();

  return {
    id: `IKeyResultId_${faker.string.uuid()}` as KeyResultId,
    title: faker.lorem.words({ min: 3, max: 6 }),
    description: faker.datatype.boolean() ? faker.lorem.sentence() : null,
    progress: {
      aggregationMethod: 'Sum',
      startingValue: 0,
      targetValue: 100,
      currentValue: 25,
      progressBaselineValue: null,
      unit: null,
    },
    progressPercentage: 25,
    isCompleted: false,
    weight: faker.number.int({ min: 1, max: 5 }),
    order: faker.number.int({ min: 0, max: 100 }),
    createdAt: now - faker.number.int({ min: 0, max: 30 * 24 * 60 * 60 * 1000 }),
    updatedAt: now,
    ...overrides,
  };
}

// ============================================================================
// GoalRecordClientDTO
// ============================================================================

/**
 * Creates a single mock GoalRecordClientDTO.
 * Pass overrides to customise specific fields.
 */
export function createMockGoalRecord(
  overrides: Partial<GoalRecordClientDTO> = {},
): GoalRecordClientDTO {
  const now = Date.now();
  const value = faker.number.int({ min: 1, max: 50 });

  return {
    id: `IGoalRecordId_${faker.string.uuid()}` as GoalRecordClientDTO['id'],
    keyResultId: `IKeyResultId_${faker.string.uuid()}` as GoalRecordClientDTO['keyResultId'],
    goalId: `IGoalId_${faker.string.uuid()}` as GoalRecordClientDTO['goalId'],
    value,
    valueAfter: faker.number.int({ min: value, max: 200 }),
    comment: faker.datatype.boolean() ? faker.lorem.sentence() : null,
    createdAt: now - faker.number.int({ min: 0, max: 30 * 24 * 60 * 60 * 1000 }),
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Creates an array of mock GoalRecordClientDTO objects.
 */
export function createMockGoalRecordList(
  count = 5,
  overrides: Partial<GoalRecordClientDTO> = {},
): GoalRecordClientDTO[] {
  return Array.from({ length: count }, () => createMockGoalRecord(overrides));
}

// ============================================================================
// GoalReviewClientDTO
// ============================================================================

/**
 * Creates a single mock GoalReviewClientDTO.
 * Pass overrides to customise specific fields.
 */
export function createMockGoalReview(
  overrides: Partial<GoalReviewClientDTO> = {},
): GoalReviewClientDTO {
  const now = Date.now();

  const start = now - 7 * 24 * 60 * 60 * 1000;
  return {
    id: `IGoalReviewId_${faker.string.uuid()}` as GoalReviewClientDTO['id'],
    goalId: `IGoalId_${faker.string.uuid()}` as GoalReviewClientDTO['goalId'],
    reflection: faker.lorem.paragraph(),
    challenges: faker.datatype.boolean() ? faker.lorem.sentence() : null,
    adjustments: faker.datatype.boolean() ? faker.lorem.sentence() : null,
    systemContext: {
      windowStartAt: start,
      windowEndAt: now,
      overallProgress: { startPercentage: 20, endPercentage: 30, deltaPercentage: 10 },
      keyResults: [],
      summary: { recordCount: 0, manualRecordCount: 0, taskContributionCount: 0 },
    },
    reviewedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Creates an array of mock GoalReviewClientDTO objects.
 */
export function createMockGoalReviewList(
  count = 3,
  overrides: Partial<GoalReviewClientDTO> = {},
): GoalReviewClientDTO[] {
  return Array.from({ length: count }, () => createMockGoalReview(overrides));
}
