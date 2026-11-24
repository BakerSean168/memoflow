import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { PowerSyncDatabase } from '@powersync/node';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LocalAgentRepository,
  LocalMcpClientRepository,
  PermissionLocalRepository,
} from '@memoflow/ai';
import { createTimeContext } from '@memoflow/time';
import { createNotificationPowerSyncModule } from '@memoflow/notification';
import { createSchedulePowerSyncModule } from '@memoflow/schedule';
import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import { createDesktopLocalAgentTools } from './local-agent-tools';
import { GatewayRoutineUpdateSchema } from '@memoflow/agent-gateway';

const identityId = 'IdentityId_00000000-0000-4000-8000-000000000001';
// routine_create rejects a WallClock trigger without a future occurrence, so a
// fixed start date goes red once that date's localTime has passed.
const routineStartDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

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
      expect(toolNames).toContain('routine_update');
      expect(toolNames).toContain('routine_delete');
      expect(toolNames).toContain('routine_pause');
      expect(toolNames).toContain('routine_override');
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
            startDate: routineStartDate,
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
      const routineRow = await db.getOptional<{
        id: string;
        name: string;
        identity_id: string;
      }>('SELECT id, name, identity_id FROM routine_definitions WHERE id = ?', [routineId]);
      expect(routineRow).not.toBeNull();
      expect(routineRow?.name).toBe('Morning Stretch');
      expect(routineRow?.identity_id).toBe(identityId);

      // 5. Verify insertion in PowerSync sync queue (ps_crud)
      const crudRows = await db.getAll<{
        id: string;
        tx_id: number;
        data: string;
      }>('SELECT id, tx_id, data FROM ps_crud ORDER BY id ASC');
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
      const receiptRows = await db.getAll<{
        id: string;
        idempotency_key: string;
      }>('SELECT id, idempotency_key FROM routine_agent_mutation_receipts WHERE identity_id = ?', [
        identityId,
      ]);
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
            startDate: routineStartDate,
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

  it('external MCP clients only discover Routine writes after a separately granted routines:write scope', async () => {
    const clients = new LocalMcpClientRepository(db);
    const bridge = createDesktopLocalAgentTools(
      db,
      store,
      () => true,
      {
        getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      },
      undefined,
      undefined,
      { clients },
    );
    try {
      await new PermissionLocalRepository(db).saveSettings(identityId, {
        preset: 'full_auto',
        agentPresets: {},
        revision: 2,
      });
      const limited = await bridge.createMcpClient(identityId, {
        name: 'Limited Reader',
        writeScopes: ['goals:write', 'tasks:write'],
      });
      const allScopes = await bridge.createMcpClient(identityId, {
        name: 'Routine Operator',
        writeScopes: ['goals:write', 'tasks:write', 'routines:write'],
      });
      const limitedList = await callMcp(
        { url: limited.endpoint.url, token: limited.token },
        'tools/list',
      );
      const privilegedList = await callMcp(
        { url: allScopes.endpoint.url, token: allScopes.token },
        'tools/list',
      );
      const limitedNames = limitedList.result.tools.map((tool: { name: string }) => tool.name);
      const privilegedNames = privilegedList.result.tools.map(
        (tool: { name: string }) => tool.name,
      );
      for (const name of [
        'routine_create',
        'routine_update',
        'routine_pause',
        'routine_override',
      ]) {
        expect(limitedNames).not.toContain(name);
        expect(privilegedNames).toContain(name);
      }
      // No synchronous approval channel exists for a persistent bearer, so
      // permanent deletion is not an available external tool even with scope.
      expect(privilegedNames).not.toContain('routine_delete');
      const create = await callMcp(
        { url: allScopes.endpoint.url, token: allScopes.token },
        'tools/call',
        {
          name: 'routine_create',
          arguments: {
            idempotencyKey: 'external-routine-create',
            name: 'Bedtime',
            trigger: {
              type: 'WallClock',
              localTime: '23:30',
              timeZone: 'UTC',
              startDate: routineStartDate,
            },
          },
        },
      );
      expect(create.result?.isError).toBeFalsy();
      const routineId = parsePayload(create).result.routine.id;
      const updateInput = {
        idempotencyKey: 'external-routine-update',
        routineId,
        expectedVersion: 1,
        name: 'Bedtime preparation',
      };
      const validation = GatewayRoutineUpdateSchema.safeParse(updateInput);
      expect(validation.success, JSON.stringify(validation.error?.issues)).toBe(true);
      const update = await callMcp(
        { url: allScopes.endpoint.url, token: allScopes.token },
        'tools/call',
        {
          name: 'routine_update',
          arguments: updateInput,
        },
      );
      expect(update.result?.isError, JSON.stringify(update.result)).toBeFalsy();
      expect(parsePayload(update).result.routine).toMatchObject({
        id: routineId,
        name: 'Bedtime preparation',
        version: 2,
      });
      const pause = await callMcp(
        { url: allScopes.endpoint.url, token: allScopes.token },
        'tools/call',
        {
          name: 'routine_pause',
          arguments: {
            idempotencyKey: 'external-routine-pause',
            routineId,
            until: Date.now() + 60 * 60_000,
            reason: 'integration test',
          },
        },
      );
      expect(pause.result?.isError, JSON.stringify(pause.result)).toBeFalsy();
      const temporary = await callMcp(
        { url: allScopes.endpoint.url, token: allScopes.token },
        'tools/call',
        {
          name: 'routine_override',
          arguments: {
            idempotencyKey: 'external-routine-override',
            routineId,
            suppressUntil: Date.now() + 40 * 60_000,
            expiresAt: Date.now() + 60 * 60_000,
            reason: 'integration test',
          },
        },
      );
      expect(temporary.result?.isError, JSON.stringify(temporary.result)).toBeFalsy();
      const deleted = await callMcp(
        { url: allScopes.endpoint.url, token: allScopes.token },
        'tools/call',
        {
          name: 'routine_delete',
          arguments: {
            idempotencyKey: 'external-routine-delete',
            routineId,
            expectedVersion: 2,
          },
        },
      );
      expect(Boolean(deleted.error || deleted.result?.isError)).toBe(true);
      expect(
        await db.getOptional('SELECT id FROM routine_definitions WHERE id = ?', [routineId]),
      ).not.toBeNull();
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
            startDate: routineStartDate,
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
            startDate: routineStartDate,
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
      contentTruncated: false,
      type: 'Reminder',
      category: 'Reminder',
      importance: 'Moderate',
      urgency: 'Medium',
      isRead: false,
      readAt: null,
      archivedAt: null,
      createdAt: 1792454400000,
      updatedAt: 1792454400000,
      version: 1,
      relatedEntityType: null,
      relatedEntityId: null,
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
              page: 1,
              pageSize: query.limit,
              hasMore: false,
            };
          },
          async getUnreadCount() {
            return 1;
          },
          async getPreferences() {
            return {
              globalChannels: { InApp: true },
              workflowOverrides: {},
              quietHours: null,
              version: 1,
              updatedAt: 1,
            };
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
      expect(notifUnread.count).toBe(1);

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

  it('notification write tools execute through the real owner and read back', async () => {
    const notifications = createNotificationPowerSyncModule(db, {
      userTimeContextPort: {
        getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      },
      transport: {
        deliver: async () => ({
          ackId: 'ack-notification-owner',
          status: 'delivered' as const,
          timestamp: Date.now(),
        }),
      },
    });
    const notificationId = 'INotificationId_00000000-0000-4000-8000-000000000042';
    const seededAt = new Date(Date.now() - 60_000).toISOString();
    await db.execute(
      `INSERT INTO notifications
       (id, identity_id, type, category, workflow_key, topic, idempotency_key, title, content,
        importance, urgency, read_at, version, created_at, updated_at, is_read)
       VALUES (?, ?, 'Reminder', 'Goal', 'goal.reminder', 'goal', 'idem-owner-1',
        'Owner read-back', 'Notification body', 'Moderate', 'Medium', ?, 1, ?, ?, 1)`,
      [notificationId, identityId, seededAt, seededAt, seededAt],
    );
    const bridge = createDesktopLocalAgentTools(
      db,
      store,
      () => true,
      {
        getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      },
      undefined,
      undefined,
      { clients: new LocalMcpClientRepository(db) },
      { notifications: notifications.api },
    );
    try {
      const connection = await store.createConnection(identityId, {
        driver: 'codex',
        name: 'Notification Owner Client',
        executablePath: 'codex',
        enabled: true,
        writeScopes: ['notifications:write'],
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
        conversationId: 'conv-notification-owner',
        runId: 'run-notification-owner',
      });

      const tools = (await callMcp(grant, 'tools/list')) as {
        result: { tools: { name: string }[] };
      };
      const toolNames = tools.result.tools.map((tool) => tool.name);
      for (const name of [
        'notification_get',
        'notification_preferences_get',
        'notification_mark_read',
        'notification_mark_unread',
        'notification_archive',
        'notification_restore',
        'notification_preferences_update',
      ])
        expect(toolNames).toContain(name);

      const before = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'notification_get',
          arguments: { id: notificationId },
        }),
      );
      expect(before.notification).toMatchObject({ id: notificationId, isRead: true });

      const unread = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'notification_mark_unread',
          arguments: { id: notificationId },
        }),
      );
      expect(unread).toMatchObject({ id: notificationId, isRead: false, readAt: null });
      const unreadReadBack = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'notification_get',
          arguments: { id: notificationId },
        }),
      );
      expect(unreadReadBack.notification).toMatchObject({ isRead: false, readAt: null });

      const read = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'notification_mark_read',
          arguments: { id: notificationId },
        }),
      );
      expect(read).toMatchObject({ id: notificationId, isRead: true });
      expect(read.readAt).toEqual(expect.any(Number));

      const archived = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'notification_archive',
          arguments: { id: notificationId },
        }),
      );
      expect(archived.archivedAt).toEqual(expect.any(Number));
      const archivedReadBack = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'notification_get',
          arguments: { id: notificationId },
        }),
      );
      expect(archivedReadBack.notification.archivedAt).toBe(archived.archivedAt);
      const archivedPage = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'notification_list',
          arguments: { archiveState: 'archived', limit: 10 },
        }),
      );
      expect(archivedPage.items.map((item: { id: string }) => item.id)).toContain(notificationId);

      const restored = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'notification_restore',
          arguments: { id: notificationId },
        }),
      );
      expect(restored.archivedAt).toBeNull();

      const updated = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'notification_preferences_update',
          arguments: { globalChannels: { InApp: false, Desktop: true } },
        }),
      );
      expect(updated.globalChannels).toMatchObject({ InApp: false, Desktop: true });
      expect(JSON.stringify(updated)).not.toContain(identityId);

      const preferences = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'notification_preferences_get',
          arguments: {},
        }),
      );
      expect(preferences.globalChannels).toMatchObject({ InApp: false, Desktop: true });

      // The persistent external client owns the same write path through the
      // token scope; the native run reads the resulting state back above.
      const external = await bridge.createMcpClient(identityId, {
        name: 'External Notification Writer',
        writeScopes: ['notifications:write'],
      });
      const externalUnread = parsePayload(
        await callMcp({ url: external.endpoint.url, token: external.token }, 'tools/call', {
          name: 'notification_mark_unread',
          arguments: { id: notificationId },
        }),
      );
      expect(externalUnread).toMatchObject({ id: notificationId, isRead: false, readAt: null });
      const externalReadBack = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'notification_get',
          arguments: { id: notificationId },
        }),
      );
      expect(externalReadBack.notification).toMatchObject({ isRead: false, readAt: null });
    } finally {
      await bridge.dispose();
      notifications.dispose();
    }
  });

  it('schedule write tools execute through the real Calendar owner and read back', async () => {
    const calendar = createSchedulePowerSyncModule(db, {
      async execute(_leaseKey, task) {
        return { acquired: true, value: await task({ ensureHeld: async () => undefined }) };
      },
    });
    const bridge = createDesktopLocalAgentTools(
      db,
      store,
      () => true,
      {
        getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      },
      undefined,
      undefined,
      { clients: new LocalMcpClientRepository(db) },
      { schedules: calendar.eventApi },
    );
    try {
      const connection = await store.createConnection(identityId, {
        driver: 'codex',
        name: 'Calendar Owner Client',
        executablePath: 'codex',
        enabled: true,
        writeScopes: ['schedules:write'],
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
        conversationId: 'conv-schedule',
        runId: 'run-schedule',
      });

      const tools = (await callMcp(grant, 'tools/list')) as {
        result: { tools: { name: string }[] };
      };
      const toolNames = tools.result.tools.map((tool) => tool.name);
      for (const name of [
        'schedule_get',
        'schedule_list',
        'schedule_create',
        'schedule_update',
        'schedule_reschedule',
        'schedule_delete',
      ])
        expect(toolNames).toContain(name);

      const start = Date.UTC(2027, 0, 4, 9, 0);
      const end = start + 3_600_000;
      const created = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'schedule_create',
          arguments: {
            name: 'Team Sync',
            description: 'Weekly team sync',
            range: { kind: 'Timed', start, end },
            attendees: ['teammate@example.com'],
          },
        }),
      );
      expect(created).toMatchObject({ version: 1 });
      expect(created.id).toEqual(expect.any(String));

      const createdReadBack = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'schedule_get',
          arguments: { id: created.id },
        }),
      );
      expect(createdReadBack.schedule).toMatchObject({
        id: created.id,
        title: 'Team Sync',
        version: 1,
      });
      expect(createdReadBack.schedule.range).toEqual({ kind: 'Timed', start, end });

      const updated = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'schedule_update',
          arguments: {
            id: created.id,
            expectedVersion: 1,
            changes: { name: 'Team Sync v2' },
          },
        }),
      );
      expect(updated).toMatchObject({ id: created.id, version: 2 });
      const updatedReadBack = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'schedule_get',
          arguments: { id: created.id },
        }),
      );
      expect(updatedReadBack.schedule.title).toBe('Team Sync v2');

      const movedStart = start + 86_400_000;
      const movedEnd = movedStart + 3_600_000;
      const rescheduled = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'schedule_reschedule',
          arguments: {
            id: created.id,
            expectedVersion: 2,
            range: { kind: 'Timed', start: movedStart, end: movedEnd },
          },
        }),
      );
      expect(rescheduled).toMatchObject({
        id: created.id,
        version: 3,
        range: { kind: 'Timed', start: movedStart, end: movedEnd },
      });
      const listed = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'schedule_list',
          arguments: { startTime: movedStart - 1, endTime: movedEnd + 1, limit: 10 },
        }),
      );
      expect(listed.items.map((item: { id: string }) => item.id)).toContain(created.id);

      // A stale expectedVersion must not overwrite the newer owner state.
      const stale = (await callMcp(grant, 'tools/call', {
        name: 'schedule_update',
        arguments: { id: created.id, expectedVersion: 1, changes: { name: 'Stale' } },
      })) as { result: { isError: boolean; content: [{ text: string }] } };
      expect(stale.result.isError).toBe(true);
      expect(stale.result.content[0].text).toBe('CONFLICT');

      // Permanent deletion without a fresh approval fails closed.
      const denied = (await callMcp(grant, 'tools/call', {
        name: 'schedule_delete',
        arguments: { id: created.id, expectedVersion: 3 },
      })) as { result: { isError: boolean; content: [{ text: string }] } };
      expect(denied.result.isError).toBe(true);
      expect(denied.result.content[0].text).toBe('PERMISSION_DENIED');
      const stillThere = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'schedule_get',
          arguments: { id: created.id },
        }),
      );
      expect(stillThere.schedule.id).toBe(created.id);

      // An approved delete removes the entry; the owner read then answers NOT_FOUND.
      const approved = await bridge.open({
        permissionMode: 'auto-approve',
        identityId,
        connectionId: connection.id,
        conversationId: 'conv-schedule-delete',
        runId: 'run-schedule-delete',
        requestApproval: async () => true,
      });
      const deleted = parsePayload(
        await callMcp(approved, 'tools/call', {
          name: 'schedule_delete',
          arguments: { id: created.id, expectedVersion: 3 },
        }),
      );
      expect(deleted).toEqual({ id: created.id, deleted: true });
      const gone = await callMcp(grant, 'tools/call', {
        name: 'schedule_get',
        arguments: { id: created.id },
      });
      expect(String(gone.result.content[0].text)).toBe('NOT_FOUND');

      // The persistent external client owns the same owner path; permanent
      // deletion stays unavailable because it has no approval channel.
      const external = await bridge.createMcpClient(identityId, {
        name: 'External Calendar Writer',
        writeScopes: ['schedules:write'],
      });
      const externalTools = (await callMcp(
        { url: external.endpoint.url, token: external.token },
        'tools/list',
      )) as { result: { tools: { name: string }[] } };
      const externalNames = externalTools.result.tools.map((tool) => tool.name);
      for (const name of ['schedule_create', 'schedule_update', 'schedule_reschedule'])
        expect(externalNames).toContain(name);
      expect(externalNames).not.toContain('schedule_delete');

      const externalCreated = parsePayload(
        await callMcp({ url: external.endpoint.url, token: external.token }, 'tools/call', {
          name: 'schedule_create',
          arguments: {
            name: 'External Standup',
            range: { kind: 'Timed', start: movedStart, end: movedEnd },
          },
        }),
      );
      const externalReadBack = parsePayload(
        await callMcp(grant, 'tools/call', {
          name: 'schedule_get',
          arguments: { id: externalCreated.id },
        }),
      );
      expect(externalReadBack.schedule).toMatchObject({
        id: externalCreated.id,
        title: 'External Standup',
      });

      // Without `schedules:write` the tools are not discovered and a direct
      // call is refused, so scope is not replaced by the read binding.
      const reader = await bridge.createMcpClient(identityId, {
        name: 'Calendar Reader',
        writeScopes: [],
      });
      const readerTools = (await callMcp(
        { url: reader.endpoint.url, token: reader.token },
        'tools/list',
      )) as { result: { tools: { name: string }[] } };
      expect(readerTools.result.tools.map((tool) => tool.name)).not.toContain('schedule_create');
      const refused = (await callMcp(
        { url: reader.endpoint.url, token: reader.token },
        'tools/call',
        {
          name: 'schedule_create',
          arguments: {
            name: 'Refused',
            range: { kind: 'Timed', start: movedStart, end: movedEnd },
          },
        },
      )) as { error?: { message: string } };
      expect(refused.error).toBeDefined();
    } finally {
      await bridge.dispose();
      await calendar.dispose();
    }
  });
});
