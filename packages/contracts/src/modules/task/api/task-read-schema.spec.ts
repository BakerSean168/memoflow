import { expect, it } from 'vitest';
import { z } from 'zod';
import { TaskPlanResponseSchema, TaskOccurrenceResponseSchema } from './response-schemas';
import { TaskTimingSchema, TaskYmdSchema } from '../value-objects/task-plan-schedule';

it('publishes Task time schemas as JSON while retaining date and window owner validation', () => {
  expect(() =>
    z.toJSONSchema(TaskPlanResponseSchema.pick({ schedule: true }), { io: 'output' }),
  ).not.toThrow();
  expect(() =>
    z.toJSONSchema(TaskOccurrenceResponseSchema.pick({ scheduleSnapshot: true }), { io: 'output' }),
  ).not.toThrow();
  expect(TaskYmdSchema.safeParse('2026-02-30').success).toBe(false);
  expect(TaskTimingSchema.safeParse({ kind: 'Window', start: '13:00', end: '12:00' }).success).toBe(
    false,
  );
  expect(TaskYmdSchema.parse('2024-02-29')).toBe('2024-02-29');
});

import { TaskOccurrenceReadQuerySchema } from './read-page.dto';
import { TaskOccurrenceListInputSchema } from '../../agent-gateway';
it('rejects instants outside canonical calendar bounds at the owner and MCP boundaries', () => {
  for (const schema of [TaskOccurrenceReadQuerySchema, TaskOccurrenceListInputSchema]) {
    expect(schema.safeParse({ startDate: Number.MAX_SAFE_INTEGER, endDate: Number.MAX_SAFE_INTEGER }).success).toBe(false);
    expect(schema.safeParse({ startDate: Date.parse('2026-10-07T00:00:00Z'), endDate: Date.parse('2026-10-08T00:00:00Z') }).success).toBe(true);
  }
});
