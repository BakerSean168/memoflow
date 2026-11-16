import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { PowerSyncDatabase } from '@powersync/node';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalAgentRepository, PermissionLocalRepository } from '@memoflow/ai';
import { createTimeContext } from '@memoflow/time';
import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import { createDesktopLocalAgentTools } from './local-agent-tools';

const identityId = 'IdentityId_00000000-0000-4000-8000-000000000001';

describe('Local Agent Domain Expansion (Phase 2, #995)', () => {
  let root: string;
  let powerSync: PowerSyncDatabase;
  let db: IElectronDatabase;
  let store: LocalAgentRepository;

  async function callMcp(
    grant: { url: string; token: string },
    method: string,
    params: Record<string, unknown> = {},
  ) {
    const res = await fetch(grant.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${grant.token}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const text = await res.text();
    const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
    if (dataLine) {
      return JSON.parse(dataLine.slice(6));
    }
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  function parsePayload<T = any>(callResponse: any): T {
    const text = callResponse.result?.content?.[0]?.text;
    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        return text as unknown as T;
      }
    }
    return callResponse.result?.structuredContent as T;
  }

  beforeEach(async () => {
    root = await mkdtemp(`${tmpdir()}/local-domains-995-`);
    powerSync = new PowerSyncDatabase({
      schema: PowerSyncAppSchema,
      database: {
        dbFilename: `${root}/powersync.sqlite`,
        openWorker: (file, options) => new Worker(file, { ...options, execArgv: [] }),
      },
    });
    await powerSync.waitForReady();
    db = {
      execute: (query, values) => powerSync.execute(query, values as unknown[]),
      getAll: (query, values) => powerSync.getAll(query, values as unknown[]),
      getOptional: (query, values) => powerSync.getOptional(query, values as unknown[]),
      get: (query, values) => powerSync.get(query, values as unknown[]),
      writeTransaction: (work) => powerSync.writeTransaction(work),
    };
    store = new LocalAgentRepository(db);
  });

  afterEach(async () => {
    await powerSync.close();
    await rm(root, { recursive: true, force: true });
  });

  it('smoke evidence: routine_create inserts into routine_definitions and queues into ps_crud sync queue with idempotency', async () => {
    const bridge = createDesktopLocalAgentTools(db, store, () => true, {
      getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
    });

    try {
      // 1. Connection with routines:write scope
      const connection = await store.createConnection(identityId, {
        driver: 'codex',
        name: 'Routine Agent',
        executablePath: 'codex',
        enabled: true,
        writeScopes: ['routines:write'],
      });

      await new PermissionLocalRepository(db).saveSettings(identityId, {
        preset: 'full_auto',
        agentPresets: {},
        revision: 2,
      });

      const grant = await bridge.open({
        permissionMode: 'auto-approve',
        identityId,
        connectionId: connection.id,
        conversationId: 'conv-routine',
        runId: 'run-routine-1',
      });

      // 2. Discover tools: routine_create must be present
      const tools = (await callMcp(grant, 'tools/list')) as {
        result: { tools: { name: string }[] };
      };
      const toolNames = tools.result.tools.map((t) => t.name);
      expect(toolNames).toContain('routine_create');
      expect(toolNames).toContain('routine_get');
      expect(toolNames).toContain('routine_list');
      expect(toolNames).toContain('routine_upcoming');

      // 3. Execute routine_create
      const createPayload = {
        name: 'routine_create',
        arguments: {
          idempotencyKey: 'idem-routine-smoke-1',
          name: 'Morning Stretch',
          description: 'Daily morning stretching routine',
          trigger: {
            type: 'WallClock',
            localTime: '08:00',
            timeZone: 'UTC',
            startDate: '2026-11-20',
          },
        },
      };

      const firstCall = await callMcp(grant, 'tools/call', createPayload);
      expect(firstCall.result).toBeDefined();
      expect(firstCall.result?.isError).toBeFalsy();
      const parsedReceipt = parsePayload(firstCall);
      expect(parsedReceipt.receiptId).toBeDefined();
      const routineId = parsedReceipt.result.routine.id;
      expect(routineId).toBeDefined();

      // 4. Verify insertion in local routine_definitions table
      const routineRow = await db.getOptional<{ id: string; name: string; identity_id: string }>(
        'SELECT id, name, identity_id FROM routine_definitions WHERE id = ?',
        [routineId],
      );
      expect(routineRow).not.toBeNull();
      expect(routineRow?.name).toBe('Morning Stretch');
      expect(routineRow?.identity_id).toBe(identityId);

      // 5. Verify insertion in PowerSync sync queue (ps_crud)
      const crudRows = await db.getAll<{ id: string; tx_id: number; data: string }>(
        'SELECT id, tx_id, data FROM ps_crud ORDER BY id ASC',
      );
      expect(crudRows.length).toBeGreaterThan(0);
      const routineCrud = crudRows.find((row) => {
        try {
          const parsed = JSON.parse(row.data);
          return parsed.type === 'routine_definitions' && parsed.id === routineId;
        } catch {
          return false;
        }
      });
      expect(routineCrud).toBeDefined();

      // 6. Verify local mutation receipt is stored locally
      const receiptRows = await db.getAll<{ id: string; idempotency_key: string }>(
        'SELECT id, idempotency_key FROM routine_agent_mutation_receipts WHERE identity_id = ?',
        [identityId],
      );
      expect(receiptRows).toHaveLength(1);
      expect(receiptRows[0].idempotency_key).toBe('idem-routine-smoke-1');

      // 7. Verify local mutation receipt table (localOnly) did NOT queue into ps_crud
      const receiptCrud = crudRows.find((row) => {
        try {
          const parsed = JSON.parse(row.data);
          return parsed.type === 'routine_agent_mutation_receipts';
        } catch {
          return false;
        }
      });
      expect(receiptCrud).toBeUndefined();

      // 8. Idempotency replay returns exact same receipt
      const replayCall = await callMcp(grant, 'tools/call', createPayload);
      const replayReceipt = parsePayload(replayCall);
      expect(replayReceipt.receiptId).toBe(parsedReceipt.receiptId);
      expect(replayReceipt.result.routine.id).toBe(routineId);

      // 9. Idempotency conflict on different payload returns error
      const conflictCall = (await callMcp(grant, 'tools/call', {
        name: 'routine_create',
        arguments: {
          idempotencyKey: 'idem-routine-smoke-1',
          name: 'Different Name',
          trigger: {
            type: 'WallClock',
            localTime: '09:00',
            timeZone: 'UTC',
            startDate: '2026-11-20',
          },
        },
      })) as {
        result: { isError: boolean; content: [{ type: string; text: string }] };
      };
      expect(conflictCall.result.isError).toBe(true);
      expect(conflictCall.result.content[0].text).toBe('IDEMPOTENCY_CONFLICT');
    } finally {
      await bridge.dispose();
    }
  });

  it('gating: routine_create is not exposed and cannot be called without routines:write scope', async () => {
    const bridge = createDesktopLocalAgentTools(db, store, () => true, {
      getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
    });

    try {
      const connection = await store.createConnection(identityId, {
        driver: 'codex',
        name: 'No Write Agent',
        executablePath: 'codex',
        enabled: true,
        writeScopes: [],
      });

      const grant = await bridge.open({
        permissionMode: 'auto-approve',
        identityId,
        connectionId: connection.id,
        conversationId: 'conv-readonly',
        runId: 'run-ro',
      });

      const tools = (await callMcp(grant, 'tools/list')) as {
        result: { tools: { name: string }[] };
      };
      const toolNames = tools.result.tools.map((t) => t.name);
      expect(toolNames).not.toContain('routine_create');

      const attemptCall = (await callMcp(grant, 'tools/call', {
        name: 'routine_create',
        arguments: {
          idempotencyKey: 'blocked-key',
          name: 'Blocked',
          trigger: {
            type: 'WallClock',
            localTime: '08:00',
            timeZone: 'UTC',
            startDate: '2026-11-20',
          },
        },
      })) as { error?: { message: string } };
      expect(attemptCall.error).toBeDefined();
    } finally {
      await bridge.dispose();
    }
  });

  it('routine reads: routine_get, routine_list, and routine_upcoming return bounded definitions and occurrences', async () => {
    const bridge = createDesktopLocalAgentTools(db, store, () => true, {
      getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
    });

    try {
      const connection = await store.createConnection(identityId, {
        driver: 'codex',
        name: 'Routine Reader',
        executablePath: 'codex',
        enabled: true,
        writeScopes: ['routines:write'],
      });

      await new PermissionLocalRepository(db).saveSettings(identityId, {
        preset: 'full_auto',
        agentPresets: {},
        revision: 2,
      });

      const grant = await bridge.open({
        permissionMode: 'auto-approve',
        identityId,
        connectionId: connection.id,
        conversationId: 'conv-reads',
        runId: 'run-reads',
      });

      // Create a routine first
      const createRes = await callMcp(grant, 'tools/call', {
        name: 'routine_create',
        arguments: {
          idempotencyKey: 'routine-for-read',
          name: 'Hydration Check',
          description: 'Drink water every 2 hours',
          trigger: {
            type: 'WallClock',
            localTime: '08:00',
            timeZone: 'UTC',
            startDate: '2026-11-20',
          },
        },
      });
      const routineReceipt = parsePayload(createRes);
      const routineId = routineReceipt.result.routine.id;

      // 1. routine_get
      const getRes = await callMcp(grant, 'tools/call', {
        name: 'routine_get',
        arguments: { id: routineId },
      });
      const getPayload = parsePayload(getRes);
      expect(getPayload.routine.id).toBe(routineId);
      expect(getPayload.routine.name).toBe('Hydration Check');

      // 2. routine_list
      const listRes = await callMcp(grant, 'tools/call', {
        name: 'routine_list',
        arguments: { query: 'Hydration', limit: 10 },
      });
      const listPayload = parsePayload(listRes);
      expect(listPayload.items.length).toBeGreaterThanOrEqual(1);
      expect(listPayload.items[0].id).toBe(routineId);

      // 3. routine_upcoming (valid bounded window <= 31 days)
      const upcomingRes = await callMcp(grant, 'tools/call', {
        name: 'routine_upcoming',
        arguments: {
          start: 1735689600000,
          end: 1735689600000 + 7 * 86400000,
          limit: 10,
        },
      });
      const upcomingPayload = parsePayload(upcomingRes);
      expect(upcomingPayload.items).toBeDefined();

      // 4. routine_upcoming rejects ranges > 31 days
      const invalidUpcoming = (await callMcp(grant, 'tools/call', {
        name: 'routine_upcoming',
        arguments: {
          start: 1735689600000,
          end: 1735689600000 + 35 * 86400000,
          limit: 10,
        },
      })) as { result: { isError: boolean } };
      expect(invalidUpcoming.result.isError).toBe(true);
    } finally {
      await bridge.dispose();
    }
  });

  it('notification and schedule reads: exposes bounded tools with pagination', async () => {
    // Mock notifications and schedules domains
    const mockNotification = {
      id: 'notif-1',
      workflowKey: 'flow-1',
      topic: 'test',
      title: 'Daily Review',
      content: 'Time for daily review',
      type: 'reminder',
      category: 'routine',
      importance: 'normal',
      urgency: 'normal',
      isRead: false,
      readAt: null,
      createdAt: '2026-11-16T10:00:00.000Z',
      updatedAt: '2026-11-16T10:00:00.000Z',
      version: 1,
    };

    const mockSchedule = {
      id: 'sched-1',
      title: 'Team Sync',
      description: 'Weekly team sync',
      range: {
        kind: 'Timed' as const,
        start: 1735689600000,
        end: 1735693200000,
      },
      version: 1,
      createdAt: 1735680000000,
      updatedAt: 1735680000000,
    };

    const bridge = createDesktopLocalAgentTools(
      db,
      store,
      () => true,
      {
        getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      },
      undefined,
      undefined,
      undefined,
      {
        notifications: {
          async getNotification(id: string) {
            return id === 'notif-1' ? mockNotification : null;
          },
          async listNotifications(query) {
            return {
              items: [mockNotification],
              total: 1,
              hasMore: false,
            };
          },
          async getUnreadCount() {
            return 1;
          },
        },
        schedules: {
          async getSchedule(id: string) {
            return id === 'sched-1' ? mockSchedule : null;
          },
          async listSchedules(query) {
            return {
              items: [mockSchedule],
              hasMore: false,
            };
          },
        },
      },
    );

    try {
      const connection = await store.createConnection(identityId, {
        driver: 'codex',
        name: 'Domain Inspector',
        executablePath: 'codex',
        enabled: true,
        writeScopes: [],
      });

      const grant = await bridge.open({
        permissionMode: 'auto-approve',
        identityId,
        connectionId: connection.id,
        conversationId: 'conv-notif-sched',
        runId: 'run-inspect',
      });

      // Verify tool discovery
      const tools = (await callMcp(grant, 'tools/list')) as {
        result: { tools: { name: string }[] };
      };
      const toolNames = tools.result.tools.map((t) => t.name);
      expect(toolNames).toContain('notification_get');
      expect(toolNames).toContain('notification_list');
      expect(toolNames).toContain('notification_unread_count');
      expect(toolNames).toContain('schedule_get');
      expect(toolNames).toContain('schedule_list');

      // 1. notification_get
      const notifGet = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'notification_get',
          arguments: { id: 'notif-1' },
        }),
      );
      expect(notifGet.notification.id).toBe('notif-1');
      expect(notifGet.notification.title).toBe('Daily Review');

      // 2. notification_list
      const notifList = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'notification_list',
          arguments: { limit: 10 },
        }),
      );
      expect(notifList.items).toHaveLength(1);
      expect(notifList.hasMore).toBe(false);

      // 3. notification_unread_count
      const notifUnread = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'notification_unread_count',
          arguments: {},
        }),
      );
      expect(notifUnread.unreadCount).toBe(1);

      // 4. schedule_get
      const schedGet = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'schedule_get',
          arguments: { id: 'sched-1' },
        }),
      );
      expect(schedGet.schedule.id).toBe('sched-1');
      expect(schedGet.schedule.title).toBe('Team Sync');

      // 5. schedule_list bounded
      const schedList = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'schedule_list',
          arguments: {
            startTime: 1735680000000,
            endTime: 1735680000000 + 7 * 86400000,
            limit: 10,
          },
        }),
      );
      expect(schedList.items).toHaveLength(1);

      // 6. schedule_list rejects windows > 90 days
      const invalidSchedList = (await callMcp(grant, 'tools/call', {
        name: 'schedule_list',
        arguments: {
          startTime: 1735680000000,
          endTime: 1735680000000 + 100 * 86400000,
          limit: 10,
        },
      })) as { result: { isError: boolean } };
      expect(invalidSchedList.result.isError).toBe(true);
    } finally {
      await bridge.dispose();
    }
  });
});
