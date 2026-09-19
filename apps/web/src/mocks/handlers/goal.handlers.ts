/**
 * MSW Handlers - Goal Module
 *
 * Paths match the actual HTTP adapters:
 *   - GoalHttpAdapter:       /goals
 */

import { http, HttpResponse } from 'msw';
import {
  createMockGoal,
  createMockGoalMutationReceipt,
  createMockQueryGoalsRes,
  createMockKeyResult,
  createMockGoalRecord,
  createMockGoalRecordList,
  createMockGoalReview,
  createMockGoalReviewList,
} from '@memoflow/contracts/mocks';
import { GoalStatus } from '@memoflow/contracts/goal';
import type {
  GoalClientDTO,
  GoalRecordClientDTO,
  GoalReviewClientDTO,
  KeyResultClientDTO,
} from '@memoflow/contracts/goal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const GOALS = `${API_BASE}/goals`;

export const goalMockRoutes = {
  goals: GOALS,
};

const toGoalId = (p: string | readonly string[] | undefined) =>
  (Array.isArray(p) ? p[0] : (p ?? '')) as GoalClientDTO['id'];

const toKeyResultId = (p: string | readonly string[] | undefined) =>
  (Array.isArray(p) ? p[0] : (p ?? '')) as GoalRecordClientDTO['keyResultId'];

const toRecordId = (p: string | readonly string[] | undefined) =>
  (Array.isArray(p) ? p[0] : (p ?? '')) as GoalRecordClientDTO['id'];

const toReviewId = (p: string | readonly string[] | undefined) =>
  (Array.isArray(p) ? p[0] : (p ?? '')) as GoalReviewClientDTO['id'];

function createKeyResultReceipt(
  goalId: GoalClientDTO['id'],
  keyResultIds: KeyResultClientDTO['id'][],
  keyResults: KeyResultClientDTO[] = [],
) {
  return createMockGoalMutationReceipt(
    { id: goalId, keyResults, totalKeyResults: keyResults.length },
    {
      affectedEntityIds: {
        goalIds: [goalId],
        keyResultIds,
        recordIds: [],
        reviewIds: [],
      },
    },
  );
}

export function createMockGoalAggregateResponse(goalId: GoalClientDTO['id']) {
  const goal = createMockGoal({ id: goalId });
  const keyResults = Array.from({ length: 3 }, () => createMockKeyResult());
  const records = createMockGoalRecordList(4, { goalId });
  const reviews = createMockGoalReviewList(2, { goalId });

  return {
    goal: {
      ...goal,
      keyResults,
      reviews,
    },
    keyResults,
    records,
    reviews,
    statistics: {
      totalKeyResults: keyResults.length,
      completedKeyResults: 1,
      totalRecords: records.length,
      totalReviews: reviews.length,
      overallProgress: 48,
    },
  };
}

export const goalHandlers = [
  // ============ Goals ============

  http.get(`${GOALS}/search`, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockQueryGoalsRes(5),
      timestamp: Date.now(),
    });
  }),

  http.get(GOALS, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockQueryGoalsRes(10),
      timestamp: Date.now(),
    });
  }),

  http.post(GOALS, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        ok: true,
        code: 200,
        message: 'Created',
        data: createMockGoalMutationReceipt({
          name: typeof body['name'] === 'string' ? body['name'] : undefined,
          status: GoalStatus.Planned,
        }),
        timestamp: Date.now(),
      },
      { status: 201 },
    );
  }),

  http.post(`${GOALS}/:id/plan`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Planned',
      data: createMockGoalMutationReceipt({
        id: toGoalId(params['id']),
        status: GoalStatus.Planned,
      }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${GOALS}/:id/activate`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Activated',
      data: createMockGoalMutationReceipt({
        id: toGoalId(params['id']),
        status: GoalStatus.InProgress,
      }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${GOALS}/:id/complete`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Completed',
      data: createMockGoalMutationReceipt({
        id: toGoalId(params['id']),
        status: GoalStatus.Completed,
        completedAt: Date.now(),
      }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${GOALS}/:id/abandon`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Abandoned',
      data: createMockGoalMutationReceipt({
        id: toGoalId(params['id']),
        status: GoalStatus.Abandoned,
      }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${GOALS}/:id/archive`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Archived',
      data: createMockGoalMutationReceipt({
        id: toGoalId(params['id']),
        status: GoalStatus.InProgress,
        archivedAt: Date.now(),
      }),
      timestamp: Date.now(),
    });
  }),

  // Key Results
  http.get(`${GOALS}/:goalId/key-results`, () => {
    const keyResults = Array.from({ length: 3 }, () => createMockKeyResult());
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: { data: keyResults, total: keyResults.length },
      timestamp: Date.now(),
    });
  }),

  http.post(`${GOALS}/:goalId/key-results`, async ({ params, request }) => {
    const goalId = toGoalId(params['goalId']);
    const body = (await request.json()) as Record<string, unknown>;
    const keyResult = createMockKeyResult(body);
    return HttpResponse.json(
      {
        ok: true,
        code: 200,
        message: 'Created',
        data: createKeyResultReceipt(goalId, [keyResult.id], [keyResult]),
        timestamp: Date.now(),
      },
      { status: 201 },
    );
  }),

  http.put(`${GOALS}/:goalId/key-results/batch-weight`, ({ params }) => {
    const goalId = toGoalId(params['goalId']);
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Updated',
      data: createKeyResultReceipt(goalId, []),
      timestamp: Date.now(),
    });
  }),

  http.put(`${GOALS}/:goalId/key-results/:keyResultId`, async ({ params, request }) => {
    const goalId = toGoalId(params['goalId']);
    const keyResultId = toKeyResultId(params['keyResultId']);
    const body = (await request.json()) as Record<string, unknown>;
    const keyResult = createMockKeyResult({ id: keyResultId, ...body });
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Updated',
      data: createKeyResultReceipt(goalId, [keyResult.id], [keyResult]),
      timestamp: Date.now(),
    });
  }),

  http.delete(`${GOALS}/:goalId/key-results/:keyResultId`, ({ params }) => {
    const goalId = toGoalId(params['goalId']);
    const keyResultId = toKeyResultId(params['keyResultId']);
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Deleted',
      data: createKeyResultReceipt(goalId, [keyResultId]),
      timestamp: Date.now(),
    });
  }),

  // Reviews
  http.get(`${GOALS}/:goalId/reviews`, ({ params }) => {
    const goalId = toGoalId(params['goalId']);
    const reviews = createMockGoalReviewList(3, { goalId });
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: { data: reviews, total: reviews.length },
      timestamp: Date.now(),
    });
  }),

  http.post(`${GOALS}/:goalId/reviews`, async ({ params, request }) => {
    const goalId = toGoalId(params['goalId']);
    const body = (await request.json()) as Record<string, unknown>;
    const review = createMockGoalReview({ goalId, ...(body as object) });
    return HttpResponse.json(
      {
        ok: true,
        code: 200,
        message: 'Created',
        data: createMockGoalMutationReceipt(
          { id: goalId, reviews: [review] },
          {
            affectedEntityIds: {
              goalIds: [goalId],
              keyResultIds: [],
              recordIds: [],
              reviewIds: [review.id],
            },
          },
        ),
        timestamp: Date.now(),
      },
      { status: 201 },
    );
  }),

  http.put(`${GOALS}/:goalId/reviews/:reviewId`, async ({ params, request }) => {
    const goalId = toGoalId(params['goalId']);
    const reviewId = toReviewId(params['reviewId']);
    const body = (await request.json()) as Record<string, unknown>;
    const review = createMockGoalReview({ id: reviewId, goalId, ...(body as object) });
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Updated',
      data: createMockGoalMutationReceipt(
        { id: goalId, reviews: [review] },
        {
          affectedEntityIds: {
            goalIds: [goalId],
            keyResultIds: [],
            recordIds: [],
            reviewIds: [review.id],
          },
        },
      ),
      timestamp: Date.now(),
    });
  }),

  http.delete(`${GOALS}/:goalId/reviews/:reviewId`, ({ params }) => {
    const goalId = toGoalId(params['goalId']);
    const reviewId = toReviewId(params['reviewId']);
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Deleted',
      data: createMockGoalMutationReceipt(
        { id: goalId },
        {
          affectedEntityIds: {
            goalIds: [goalId],
            keyResultIds: [],
            recordIds: [],
            reviewIds: [reviewId],
          },
        },
      ),
      timestamp: Date.now(),
    });
  }),

  // Records
  http.get(`${GOALS}/:goalId/records`, ({ params }) => {
    const goalId = toGoalId(params['goalId']);
    const records = createMockGoalRecordList(5, { goalId });
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: { data: records, total: records.length },
      timestamp: Date.now(),
    });
  }),

  http.get(`${GOALS}/:goalId/key-results/:keyResultId/records`, ({ params }) => {
    const goalId = toGoalId(params['goalId']);
    const keyResultId = toKeyResultId(params['keyResultId']);
    const records = createMockGoalRecordList(3, { goalId, keyResultId });
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: { data: records, total: records.length },
      timestamp: Date.now(),
    });
  }),

  http.post(`${GOALS}/:goalId/key-results/:keyResultId/records`, async ({ params, request }) => {
    const goalId = toGoalId(params['goalId']);
    const keyResultId = toKeyResultId(params['keyResultId']);
    const body = (await request.json()) as Record<string, unknown>;
    const record = createMockGoalRecord({
      goalId,
      keyResultId,
      ...(body as object),
    });
    return HttpResponse.json(
      {
        ok: true,
        code: 200,
        message: 'Created',
        data: createMockGoalMutationReceipt(
          { id: goalId },
          {
            affectedEntityIds: {
              goalIds: [goalId],
              keyResultIds: [keyResultId],
              recordIds: [record.id],
              reviewIds: [],
            },
            recordChanges: { upserted: [record], removedIds: [] },
          },
        ),
        timestamp: Date.now(),
      },
      { status: 201 },
    );
  }),

  http.delete(`${GOALS}/:goalId/key-results/:keyResultId/records/:recordId`, ({ params }) => {
    const goalId = toGoalId(params['goalId']);
    const keyResultId = toKeyResultId(params['keyResultId']);
    const recordId = toRecordId(params['recordId']);
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Deleted',
      data: createMockGoalMutationReceipt(
        { id: goalId },
        {
          affectedEntityIds: {
            goalIds: [goalId],
            keyResultIds: [keyResultId],
            recordIds: [recordId],
            reviewIds: [],
          },
          recordChanges: { upserted: [], removedIds: [recordId] },
        },
      ),
      timestamp: Date.now(),
    });
  }),

  http.get(`${GOALS}/:id`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockGoal({ id: toGoalId(params['id']) }),
      timestamp: Date.now(),
    });
  }),

  http.patch(`${GOALS}/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body['name'] === 'string' ? body['name'] : undefined;
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Updated',
      data: createMockGoalMutationReceipt({
        id: toGoalId(params['id']),
        ...(body as object),
        ...(name ? { name } : {}),
      }),
      timestamp: Date.now(),
    });
  }),

  http.get(`${GOALS}/:id/aggregate`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockGoalAggregateResponse(toGoalId(params['id'])),
      timestamp: Date.now(),
    });
  }),

  http.post(`${GOALS}/:id/clone`, async ({ params, request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const original = createMockGoal({ id: toGoalId(params['id']) });
    return HttpResponse.json(
      {
        ok: true,
        code: 200,
        message: 'Created',
        data: createMockGoalMutationReceipt({
          name:
            (typeof body['name'] === 'string' ? body['name'] : undefined) ??
            `${original.name} (copy)`,
          summary: typeof body['summary'] === 'string' ? body['summary'] : original.summary,
        }),
        timestamp: Date.now(),
      },
      { status: 201 },
    );
  }),

  http.delete(`${GOALS}/:id`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Deleted',
      data: createMockGoalMutationReceipt({ id: toGoalId(params['id']) }),
      timestamp: Date.now(),
    });
  }),

  // AI
  http.get(`${API_BASE}/ai/generate/key-results`, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: Array.from({ length: 3 }, () => createMockKeyResult()),
      timestamp: Date.now(),
    });
  }),
];
