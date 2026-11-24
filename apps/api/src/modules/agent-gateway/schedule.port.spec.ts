import { describe, expect, it, vi } from 'vitest';
import { GatewayReadError } from '@memoflow/agent-gateway';
import type { GatewayWriteAuthority } from '@memoflow/agent-gateway';
import type { ScheduleEventApplicationPort } from '@memoflow/schedule';
import type { CalendarEntryRange } from '@memoflow/schedule-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { error, ok } from '@memoflow/transport-contracts/result';
import { bindScheduleWrites } from './schedule.port';

interface Row {
  id: string;
  identityId: string;
  title: string;
  range: CalendarEntryRange;
  version: number;
  updatedAt: number;
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'schedule-1',
    identityId: 'owner-a',
    title: 'Team Sync',
    range: { kind: 'Timed', start: 1_000, end: 2_000 },
    version: 1,
    updatedAt: 1,
    ...overrides,
  };
}

/**
 * Owner-shaped fake: every command is scoped by the caller's identity and
 * enforces expectedVersion exactly like the real Schedule application service.
 */
function calendar(rows: Row[]) {
  const owned = (id: string, identityId: string) =>
    rows.find((item) => item.id === id && item.identityId === identityId);
  const createEvent = vi.fn(
    async (input: { name: string; range: CalendarEntryRange }, cx: ExecutionContext) => {
      const created = row({
        id: `schedule-${rows.length + 1}`,
        identityId: cx.identityId,
        title: input.name,
        range: input.range,
        version: 1,
        updatedAt: Date.now(),
      });
      rows.push(created);
      return ok({ ...created });
    },
  );
  const getEvent = vi.fn(async (id: string, cx: ExecutionContext) => {
    const target = owned(id, cx.identityId);
    return target ? ok({ ...target }) : error('NOT_FOUND', `Schedule ${id} not found`);
  });
  const updateEvent = vi.fn(
    async (
      id: string,
      input: { name?: string; range?: CalendarEntryRange; expectedVersion: number },
      cx: ExecutionContext,
    ) => {
      const target = owned(id, cx.identityId);
      if (!target) return error('NOT_FOUND', `Schedule ${id} not found`);
      if (target.version !== input.expectedVersion)
        return error('CONFLICT', 'Expected version does not match');
      if (input.name !== undefined) target.title = input.name;
      if (input.range !== undefined) target.range = input.range;
      target.version += 1;
      target.updatedAt += 10;
      return ok({ ...target });
    },
  );
  const deleteEvent = vi.fn(async (id: string, cx: ExecutionContext, expectedVersion: number) => {
    const target = owned(id, cx.identityId);
    if (!target) return error('NOT_FOUND', `Schedule ${id} not found`);
    if (target.version !== expectedVersion)
      return error('CONFLICT', 'Expected version does not match');
    rows.splice(rows.indexOf(target), 1);
    return ok(null);
  });
  return {
    port: {
      createEvent,
      getEvent,
      updateEvent,
      deleteEvent,
    } as unknown as ScheduleEventApplicationPort,
    createEvent,
    getEvent,
    updateEvent,
    deleteEvent,
  };
}

const context = (identityId: string): ExecutionContext => ({
  requestId: 'request-a',
  traceId: 'trace-a',
  startedAt: 1,
  source: 'http',
  identityId,
});
const authority: GatewayWriteAuthority = {
  connectionId: 'pat-a',
  credentialType: 'pat',
  scopes: ['schedules:write'],
  authorize: async () => {},
};

describe('Schedule owner write binding', () => {
  it('creates through the owner and answers the minimal receipt', async () => {
    const rows: Row[] = [];
    const f = calendar(rows);
    const writes = bindScheduleWrites(f.port);
    const receipt = await writes.scheduleCreate(
      {
        name: 'Team Sync',
        range: { kind: 'Timed', start: 1_000, end: 2_000 },
        description: 'Weekly',
      },
      context('owner-a'),
      authority,
    );
    expect(receipt).toEqual({
      id: 'schedule-1',
      version: 1,
      updatedAt: expect.any(Number),
    });
    expect(f.createEvent).toHaveBeenCalledOnce();
    expect(rows[0]).toMatchObject({ identityId: 'owner-a', title: 'Team Sync', version: 1 });
  });

  it('patches metadata, reschedules, and keeps the read-back consistent', async () => {
    const target = row();
    const f = calendar([target]);
    const writes = bindScheduleWrites(f.port);
    const cx = context('owner-a');

    expect(
      await writes.scheduleUpdate(
        { id: target.id, expectedVersion: 1, changes: { name: 'Team Sync v2' } },
        cx,
        authority,
      ),
    ).toMatchObject({ id: target.id, version: 2 });
    expect(target.title).toBe('Team Sync v2');

    const range = { kind: 'Timed' as const, start: 3_000, end: 4_000 };
    expect(
      await writes.scheduleReschedule({ id: target.id, expectedVersion: 2, range }, cx, authority),
    ).toEqual({ id: target.id, version: 3, updatedAt: expect.any(Number), range });
    expect(target.range).toEqual(range);

    expect(
      await writes.scheduleDelete({ id: target.id, expectedVersion: 3 }, cx, authority),
    ).toEqual({ id: target.id, deleted: true });
    expect(f.deleteEvent).toHaveBeenCalledWith(target.id, cx, 3);
    await expect(f.port.getEvent(target.id, cx)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('maps a stale expectedVersion to CONFLICT and never mutates the newer state', async () => {
    const target = row({ version: 4 });
    const f = calendar([target]);
    const writes = bindScheduleWrites(f.port);
    await expect(
      writes.scheduleUpdate(
        { id: target.id, expectedVersion: 1, changes: { name: 'Stale' } },
        context('owner-a'),
        authority,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(target.title).toBe('Team Sync');
    expect(target.version).toBe(4);
  });

  it('refuses another owner entry and a credential without schedules:write', async () => {
    const target = row();
    const f = calendar([target]);
    const writes = bindScheduleWrites(f.port);
    await expect(
      writes.scheduleUpdate(
        { id: target.id, expectedVersion: 1, changes: { name: 'Foreign' } },
        context('owner-b'),
        authority,
      ),
    ).rejects.toBeInstanceOf(GatewayReadError);
    await expect(
      writes.scheduleUpdate(
        { id: target.id, expectedVersion: 1, changes: { name: 'Foreign' } },
        context('owner-b'),
        authority,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(target.title).toBe('Team Sync');

    const authorize = vi.fn(async () => {});
    await expect(
      writes.scheduleCreate(
        { name: 'Denied', range: { kind: 'Timed', start: 1, end: 2 } },
        context('owner-a'),
        { ...authority, scopes: ['schedules:read'], authorize },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(authorize).not.toHaveBeenCalled();
    expect(f.createEvent).not.toHaveBeenCalled();
  });

  it('revalidates the write authority immediately before the owner call', async () => {
    const f = calendar([]);
    const writes = bindScheduleWrites(f.port);
    const authorize = vi.fn(async () => {
      throw new GatewayReadError('FORBIDDEN');
    });
    await expect(
      writes.scheduleCreate(
        { name: 'Revoked', range: { kind: 'Timed', start: 1, end: 2 } },
        context('owner-a'),
        { ...authority, authorize },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.createEvent).not.toHaveBeenCalled();
  });

  it('rejects a metadata patch with no defined change and a metadata range attempt', async () => {
    const f = calendar([]);
    const writes = bindScheduleWrites(f.port);
    await expect(
      writes.scheduleUpdate(
        { id: 'schedule-1', expectedVersion: 1, changes: {} },
        context('owner-a'),
        authority,
      ),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      writes.scheduleUpdate(
        { id: 'schedule-1', expectedVersion: 1, changes: { range: { kind: 'Timed' } } },
        context('owner-a'),
        authority,
      ),
    ).rejects.toBeInstanceOf(Error);
    expect(f.updateEvent).not.toHaveBeenCalled();
  });
});
