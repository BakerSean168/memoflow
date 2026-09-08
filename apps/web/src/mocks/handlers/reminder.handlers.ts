/**
 * MSW Handlers - Reminder Module
 *
 * Paths match the actual HTTP adapter:
 *   - ReminderHttpAdapter: /reminders/templates, /reminder-groups, /reminders/upcoming
 */

import { http, HttpResponse } from 'msw';
import {
  createMockReminderTemplate,
  createMockReminderTemplateList,
  createMockReminderGroup,
  createMockReminderGroupList,
} from '@memoflow/contracts/mocks';
import type {
  ReminderTemplateClientDTO,
  ReminderGroupClientDTO,
} from '@memoflow/contracts/reminder';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const TEMPLATES = `${API_BASE}/reminders/templates`;
const GROUPS = `${API_BASE}/reminder-groups`;

const toTemplateId = (p: string | readonly string[] | undefined) =>
  (Array.isArray(p) ? p[0] : (p ?? '')) as ReminderTemplateClientDTO['id'];

const toGroupId = (p: string | readonly string[] | undefined) =>
  (Array.isArray(p) ? p[0] : (p ?? '')) as ReminderGroupClientDTO['id'];

export const reminderHandlers = [
  // ============ Templates ============

  http.get(`${TEMPLATES}/search`, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockReminderTemplateList(5),
      timestamp: Date.now(),
    });
  }),

  http.get(`${TEMPLATES}/user/:identityId`, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockReminderTemplateList(8),
      timestamp: Date.now(),
    });
  }),

  http.get(TEMPLATES, () => {
    const templates = createMockReminderTemplateList(10);
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: { templates, total: templates.length, page: 1, pageSize: 10, hasMore: false },
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
        data: createMockReminderTemplate({ name: body.name as string }),
        timestamp: Date.now(),
      },
      { status: 201 },
    );
  }),

  http.get(`${TEMPLATES}/:id/schedule-status`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: {
        templateId: toTemplateId(params['id']),
        hasSchedule: true,
        nextExecutionTime: Date.now() + 3600000,
        lastExecutionTime: Date.now() - 3600000,
        status: 'active',
      },
      timestamp: Date.now(),
    });
  }),

  http.post(`${TEMPLATES}/:id/toggle`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Toggled',
      data: createMockReminderTemplate({ id: toTemplateId(params['id']) }),
      timestamp: Date.now(),
    });
  }),

  http.post(`${TEMPLATES}/:templateId/move`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Moved',
      data: createMockReminderTemplate({ id: toTemplateId(params['templateId']) }),
      timestamp: Date.now(),
    });
  }),

  http.get(`${TEMPLATES}/:id`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockReminderTemplate({ id: toTemplateId(params['id']) }),
      timestamp: Date.now(),
    });
  }),

  http.patch(`${TEMPLATES}/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Updated',
      data: createMockReminderTemplate({ id: toTemplateId(params['id']), ...(body as object) }),
      timestamp: Date.now(),
    });
  }),

  http.put(`${TEMPLATES}/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Updated',
      data: createMockReminderTemplate({ id: toTemplateId(params['id']), ...(body as object) }),
      timestamp: Date.now(),
    });
  }),

  http.delete(`${TEMPLATES}/:id`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Deleted',
      data: { id: params.id },
      timestamp: Date.now(),
    });
  }),

  // ============ Upcoming ============

  http.get(`${API_BASE}/reminders/upcoming`, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: { data: createMockReminderTemplateList(3), total: 3 },
      timestamp: Date.now(),
    });
  }),

  // ============ Groups ============

  http.get(`${GROUPS}/user/:identityId`, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockReminderGroupList(3),
      timestamp: Date.now(),
    });
  }),

  http.get(GROUPS, () => {
    const groups = createMockReminderGroupList(5);
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: { groups, total: groups.length, page: 1, pageSize: 10, hasMore: false },
      timestamp: Date.now(),
    });
  }),

  http.post(GROUPS, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        ok: true,
        code: 200,
        message: 'Created',
        data: createMockReminderGroup({ name: body.name as string }),
        timestamp: Date.now(),
      },
      { status: 201 },
    );
  }),

  http.post(`${GROUPS}/:id/toggle`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Toggled',
      data: createMockReminderGroup({ id: toGroupId(params['id']) }),
      timestamp: Date.now(),
    });
  }),

  http.get(`${GROUPS}/:id`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockReminderGroup({ id: toGroupId(params['id']) }),
      timestamp: Date.now(),
    });
  }),

  http.patch(`${GROUPS}/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Updated',
      data: createMockReminderGroup({ id: toGroupId(params['id']), ...(body as object) }),
      timestamp: Date.now(),
    });
  }),

  http.put(`${GROUPS}/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Updated',
      data: createMockReminderGroup({ id: toGroupId(params['id']), ...(body as object) }),
      timestamp: Date.now(),
    });
  }),

  http.delete(`${GROUPS}/:id`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Deleted',
      data: { id: params.id },
      timestamp: Date.now(),
    });
  }),
];
