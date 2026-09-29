import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** PLAN-4304 retirement lock: one FullCalendar time formatter replaces Day/Week copies. */
describe('Planner event time formatting retirement (PLAN-4304)', () => {
  const dir = __dirname;
  const planner = readFileSync(
    resolve(dir, '../../modules/schedule/planner/PlannerCalendar.vue'),
    'utf8',
  );

  it('keeps Planner time presentation on FullCalendar configuration instead of local formatters', () => {
    expect(planner).toContain("slotHeaderFormat: { hour: '2-digit', minute: '2-digit', hour12: false }");
    expect(planner).toContain('displayEventTime: false');
    expect(planner).not.toContain('function formatEventTime');
    expect(planner).not.toContain('formatLocalHHmm');
  });
});
