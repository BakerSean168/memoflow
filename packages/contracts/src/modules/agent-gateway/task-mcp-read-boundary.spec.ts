import { expect, it } from 'vitest';
import { TaskOccurrenceListInputSchema } from './index';
import { TaskOccurrenceReadQuerySchema } from '@memoflow/task-contracts';

/**
 * The MCP edge must stay in lockstep with the Task owner schema: both reject
 * instants outside the canonical calendar bounds and accept a real window.
 * 属主 Schema 归 @memoflow/task-contracts（Issue #630 §4.2），网关侧只做同口径复核。
 */
it('rejects instants outside canonical calendar bounds at the MCP boundary', () => {
  for (const schema of [TaskOccurrenceListInputSchema, TaskOccurrenceReadQuerySchema]) {
    expect(
      schema.safeParse({ startDate: Number.MAX_SAFE_INTEGER, endDate: Number.MAX_SAFE_INTEGER })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        startDate: Date.parse('2026-10-07T00:00:00Z'),
        endDate: Date.parse('2026-10-08T00:00:00Z'),
      }).success,
    ).toBe(true);
  }
});
