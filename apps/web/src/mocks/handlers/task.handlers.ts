import { http, HttpResponse } from 'msw';
import {
  createMockTaskPlan,
  createMockTaskPlanList,
  createMockTaskOccurrence,
  createMockTaskOccurrenceList,
} from '@memoflow/contracts/mocks';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const PLANS = `${API_BASE}/task-plans`;
const OCCURRENCES = `${API_BASE}/task-occurrences`;

export const taskMockRoutes = {
  plans: PLANS,
  occurrences: OCCURRENCES,
};

type MockTaskPlanOverrides = NonNullable<Parameters<typeof createMockTaskPlan>[0]>;
type MockTaskOccurrenceOverrides = NonNullable<Parameters<typeof createMockTaskOccurrence>[0]>;
type TaskPlanId = NonNullable<MockTaskPlanOverrides['id']>;
type TaskOccurrenceId = NonNullable<MockTaskOccurrenceOverrides['id']>;

const toTaskPlanId = (value: string | readonly string[] | undefined): TaskPlanId =>
  (Array.isArray(value) ? value[0] : (value ?? '')) as TaskPlanId;

const toTaskOccurrenceId = (value: string | readonly string[] | undefined): TaskOccurrenceId =>
  (Array.isArray(value) ? value[0] : (value ?? '')) as TaskOccurrenceId;
export const taskHandlers = [
  http.get(PLANS, () => {
    const plans = createMockTaskPlanList(10);
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: { plans, total: plans.length },
      timestamp: Date.now(),
    });
  }),

  http.post(PLANS, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const plan = createMockTaskPlan({ name: body.name as string });
    return HttpResponse.json(
      {
        ok: true,
        code: 200,
        message: 'Created',
        data: { plan, occurrenceCount: 0, todayOccurrenceCreated: false },
        timestamp: Date.now(),
      },
      { status: 201 },
    );
  }),

  http.get(OCCURRENCES, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockTaskOccurrenceList(8),
      timestamp: Date.now(),
    });
  }),

  http.post(`${OCCURRENCES}/:id/start`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Started',
      data: createMockTaskOccurrence({ id: toTaskOccurrenceId(params.id), status: 'InProgress' }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${OCCURRENCES}/:id/complete`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Completed',
      data: createMockTaskOccurrence({ id: toTaskOccurrenceId(params.id), status: 'Completed' }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${OCCURRENCES}/:id/missed`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Missed',
      data: createMockTaskOccurrence({ id: toTaskOccurrenceId(params.id), status: 'Missed' }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${OCCURRENCES}/:id/skip`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Skipped',
      data: createMockTaskOccurrence({ id: toTaskOccurrenceId(params.id), status: 'Skipped' }),
      timestamp: Date.now(),
    });
  }),

  http.get(`${OCCURRENCES}/:id`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockTaskOccurrence({ id: toTaskOccurrenceId(params.id) }),
      timestamp: Date.now(),
    });
  }),

  http.delete(`${OCCURRENCES}/:id`, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Deleted',
      data: null,
      timestamp: Date.now(),
    });
  }),

  http.get(`${PLANS}/:id/occurrences`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockTaskOccurrenceList(5, { planId: toTaskPlanId(params.id) }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${PLANS}/:id/generate-occurrences`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Generated',
      data: createMockTaskOccurrenceList(3, { planId: toTaskPlanId(params.id) }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${PLANS}/:id/activate`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Activated',
      data: createMockTaskPlan({ id: toTaskPlanId(params.id), status: 'Active' }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${PLANS}/:id/pause`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Paused',
      data: createMockTaskPlan({ id: toTaskPlanId(params.id), status: 'Paused' }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${PLANS}/:id/archive`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Archived',
      data: createMockTaskPlan({
        id: toTaskPlanId(params.id),
        status: 'Active',
        archivedAt: Date.now(),
      }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${PLANS}/:id/bind-goal`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Bound',
      data: createMockTaskPlan({ id: toTaskPlanId(params.id) }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${PLANS}/:id/unbind-goal`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Unbound',
      data: createMockTaskPlan({ id: toTaskPlanId(params.id), goalBinding: null }),
      timestamp: Date.now(),
    });
  }),

  http.get(`${PLANS}/:id`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockTaskPlan({ id: toTaskPlanId(params.id) }),
      timestamp: Date.now(),
    });
  }),

  http.patch(`${PLANS}/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Updated',
      data: createMockTaskPlan({ id: toTaskPlanId(params.id), ...(body as object) }),
      timestamp: Date.now(),
    });
  }),

  http.put(`${PLANS}/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Updated',
      data: createMockTaskPlan({ id: toTaskPlanId(params.id), ...(body as object) }),
      timestamp: Date.now(),
    });
  }),

  http.delete(`${PLANS}/:id`, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Deleted',
      data: null,
      timestamp: Date.now(),
    });
  }),
];
