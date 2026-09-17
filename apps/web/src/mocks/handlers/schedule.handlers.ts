/**
 * MSW Handlers - Schedule Module
 *
 * Paths match the actual HTTP adapters:
 *   - ScheduleEventHttpAdapter: /schedules/events
 */

import { http, HttpResponse } from 'msw';
import { faker } from '@faker-js/faker';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const EVENTS = `${API_BASE}/schedules/events`;


function createMockCalendarEntry(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const start = now + faker.number.int({ min: 3600000, max: 86400000 });
  return {
    id: faker.string.uuid(),
    identityId: faker.string.uuid(),
    title: faker.lorem.words({ min: 2, max: 5 }),
    description: faker.datatype.boolean() ? faker.lorem.sentence() : null,
    startTime: start,
    endTime: start + faker.number.int({ min: 1800000, max: 7200000 }),
    duration: faker.number.int({ min: 30, max: 120 }),
    priority: faker.number.int({ min: 1, max: 5 }),
    location: faker.datatype.boolean() ? faker.location.streetAddress() : null,
    attendees: [],
    status: faker.helpers.arrayElement(['Active', 'Completed', 'Cancelled']),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const scheduleHandlers = [
  // ============ Events ============

  http.get(`${EVENTS}/conflicts/detect`, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: { hasConflict: false, conflicts: [], suggestions: [] },
      timestamp: Date.now(),
    });
  }),

  http.get(EVENTS, () => {
    const events = Array.from({ length: 8 }, () => createMockCalendarEntry());
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: events,
      timestamp: Date.now(),
    });
  }),

  http.post(`${EVENTS}/conflicts/detect`, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: { hasConflict: false, conflicts: [], suggestions: [] },
      timestamp: Date.now(),
    });
  }),

  http.post(`${EVENTS}/with-conflict-detection`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        ok: true,
        code: 200,
        message: 'Created',
        data: { schedule: createMockCalendarEntry(body), conflicts: null },
        timestamp: Date.now(),
      },
      { status: 201 },
    );
  }),

  http.post(EVENTS, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        ok: true,
        code: 200,
        message: 'Created',
        data: createMockCalendarEntry(body),
        timestamp: Date.now(),
      },
      { status: 201 },
    );
  }),

  http.get(`${EVENTS}/:id/conflicts`, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: { hasConflict: false, conflicts: [], suggestions: [] },
      timestamp: Date.now(),
    });
  }),

  http.post(`${EVENTS}/:id/resolve-conflict`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Resolved',
      data: {
        schedule: createMockCalendarEntry({ id: params.id }),
        conflicts: { hasConflict: false, conflicts: [], suggestions: [] },
        applied: { strategy: 'move', changes: [] },
      },
      timestamp: Date.now(),
    });
  }),

  http.get(`${EVENTS}/:id`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: createMockCalendarEntry({ id: params.id }),
      timestamp: Date.now(),
    });
  }),

  http.patch(`${EVENTS}/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Updated',
      data: createMockCalendarEntry({ id: params.id, ...body }),
      timestamp: Date.now(),
    });
  }),

  http.delete(`${EVENTS}/:id`, ({ params }) => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Deleted',
      data: { id: params.id },
      timestamp: Date.now(),
    });
  }),

];
