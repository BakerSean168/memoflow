import { http, HttpResponse } from 'msw';
import {
  createMockTaskPlan,
  createMockTaskPlanList,
  createMockTaskOccurrence,
  createMockTaskOccurrenceList,
} from '@memoflow/contracts/mocks';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const TEMPLATES = `${API_BASE}/task-plans`;
const INSTANCES = `${API_BASE}/task-occurrences`;

export const taskMockRoutes = {
  templates: TEMPLATES,
  instances: INSTANCES,
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
  http.get(TEMPLATES, () => {
    const templates = createMockTaskPlanList(10);
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: { templates, total: templates.length },
      timestamp: Date.now(),
    });
  }),

  http.post(TEMPLATES, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        ok: true,
        code: 200,
        message: 'Created',
        data: createMockTaskPlan({ name: body.name as string }),
        timestamp: Date.now(),
      },
      { status: 201 },
    );
  }),

  http.get(INSTANCES, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockTaskOccurrenceList(8),
      timestamp: Date.now(),
    });
  }),

  http.post(`${INSTANCES}/:id/start`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Started',
      data: createMockTaskOccurrence({ id: toTaskOccurrenceId(params.id), status: 'InProgress' }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${INSTANCES}/:id/complete`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Completed',
      data: createMockTaskOccurrence({ id: toTaskOccurrenceId(params.id), status: 'Completed' }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${INSTANCES}/:id/missed`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Missed',
      data: createMockTaskOccurrence({ id: toTaskOccurrenceId(params.id), status: 'Missed' }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${INSTANCES}/:id/skip`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Skipped',
      data: createMockTaskOccurrence({ id: toTaskOccurrenceId(params.id), status: 'Skipped' }),
      timestamp: Date.now(),
    });
  }),

  http.get(`${INSTANCES}/:id`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockTaskOccurrence({ id: toTaskOccurrenceId(params.id) }),
      timestamp: Date.now(),
    });
  }),

  http.delete(`${INSTANCES}/:id`, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Deleted',
      data: null,
      timestamp: Date.now(),
    });
  }),

  http.get(`${TEMPLATES}/:id/instances`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockTaskOccurrenceList(5, { templateId: toTaskPlanId(params.id) }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${TEMPLATES}/:id/generate-instances`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Generated',
      data: createMockTaskOccurrenceList(3, { templateId: toTaskPlanId(params.id) }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${TEMPLATES}/:id/activate`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Activated',
      data: createMockTaskPlan({ id: toTaskPlanId(params.id), status: 'Active' }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${TEMPLATES}/:id/pause`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Paused',
      data: createMockTaskPlan({ id: toTaskPlanId(params.id), status: 'Paused' }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${TEMPLATES}/:id/archive`, ({ params }) => {
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

  http.post(`${TEMPLATES}/:id/bind-goal`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Bound',
      data: createMockTaskPlan({ id: toTaskPlanId(params.id) }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${TEMPLATES}/:id/unbind-goal`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Unbound',
      data: createMockTaskPlan({ id: toTaskPlanId(params.id), goalBinding: null }),
      timestamp: Date.now(),
    });
  }),

  http.get(`${TEMPLATES}/:id`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockTaskPlan({ id: toTaskPlanId(params.id) }),
      timestamp: Date.now(),
    });
  }),

  http.patch(`${TEMPLATES}/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Updated',
      data: createMockTaskPlan({ id: toTaskPlanId(params.id), ...(body as object) }),
      timestamp: Date.now(),
    });
  }),

  http.put(`${TEMPLATES}/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Updated',
      data: createMockTaskPlan({ id: toTaskPlanId(params.id), ...(body as object) }),
      timestamp: Date.now(),
    });
  }),

  http.delete(`${TEMPLATES}/:id`, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Deleted',
      data: null,
      timestamp: Date.now(),
    });
  }),

];
