import { describe, expect, it } from 'vitest';
import { createLocalAgentSqlite } from '../../../../testing/local-agent-sqlite';
import { LocalGatewayAuditRepository } from './local-gateway-audit.repository';

function event(overrides: Partial<Parameters<LocalGatewayAuditRepository['record']>[1]> = {}) {
  return {
    version: '1' as const,
    at: 1_000,
    connectionId: 'connection-1',
    origin: 'client' as const,
    tool: 'goal_get',
    effect: 'read' as const,
    scopeDecision: 'allowed' as const,
    outcome: 'ok',
    durationMs: 3,
    requestId: 'request-1',
    traceId: 'trace-1',
    ...overrides,
  };
}

describe('local gateway audit repository', () => {
  it('appends and lists newest-first, scoped to the Profile owner', async () => {
    const db = createLocalAgentSqlite();
    try {
      const audit = new LocalGatewayAuditRepository(db);
      await audit.record('owner', event({ at: 1_000, tool: 'goal_get' }));
      await audit.record('owner', event({ at: 2_000, tool: 'task_plan_search' }));
      await audit.record('other', event({ at: 3_000, tool: 'goal_search' }));

      const rows = await audit.list('owner');
      expect(rows.map((row) => row.tool)).toEqual(['task_plan_search', 'goal_get']);
      expect(rows[0]).toMatchObject({
        connectionId: 'connection-1',
        origin: 'client',
        effect: 'read',
        scopeDecision: 'allowed',
        outcome: 'ok',
        durationMs: 3,
        requestId: 'request-1',
        traceId: 'trace-1',
      });
      expect(rows[0]?.id).toMatch(/[0-9a-f-]{36}/u);

      expect(await audit.list('other')).toHaveLength(1);
      expect(await audit.list('owner', 1)).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('stores denied write outcomes without tool arguments or results', async () => {
    const db = createLocalAgentSqlite();
    try {
      const audit = new LocalGatewayAuditRepository(db);
      await audit.record(
        'owner',
        event({
          tool: 'task_create',
          effect: 'write',
          scopeDecision: 'denied',
          outcome: 'PERMISSION_DENIED',
        }),
      );

      const [row] = await audit.list('owner');
      expect(row).toMatchObject({ tool: 'task_create', effect: 'write', scopeDecision: 'denied' });
      expect(Object.keys(row!).sort()).toEqual(
        [
          'at',
          'connectionId',
          'durationMs',
          'effect',
          'id',
          'origin',
          'outcome',
          'requestId',
          'scopeDecision',
          'tool',
          'traceId',
          'version',
        ].sort(),
      );
    } finally {
      db.close();
    }
  });
});
