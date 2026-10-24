import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import type { WorkflowRunState } from '@mastra/core/workflows';
import { describe, expect, it, vi } from 'vitest';
import { createMastraStorage } from './storage';
import { getGoalWorkflowEventSource } from './goal-workflow-events.registry';
import { publishRunningGoalActions } from '../workflows/goal-business-action-journal';
import { AIWorkflowPublicError } from '../../../shared/ai-workflow-error';
import { workspaceEventStream } from '../../transport/workspace-event-stream';

describe('Goal committed event journal over real LibSQL', () => {
  it('serializes source reads with native interactive writes on a single in-memory connection', async () => {
    const storage = createMastraStorage({ kind: 'libsql', url: 'file::memory:' });
    try {
      await storage.init();
      const source = getGoalWorkflowEventSource(storage)!;
      const workflows = await storage.getStore('workflows');
      if (!workflows) throw new Error('Workflow storage unavailable');
      const ids = Array.from({ length: 8 }, (_, index) => `concurrent-${index}`);
      await Promise.all(
        ids.map((runId) =>
          workflows.persistWorkflowSnapshot({
            workflowName: 'goal-create',
            runId,
            resourceId: 'owner',
            snapshot: {
              status: 'running',
              context: { input: { idea: 'Plan', identityId: 'owner', conversationId: 'thread' } },
              value: { liveActions: [] },
            } as unknown as WorkflowRunState,
          }),
        ),
      );
      await Promise.all(
        ids.flatMap((runId) => [
          publishRunningGoalActions({
            storage,
            identityId: 'owner',
            runId,
            journal: [
              {
                sequence: 1,
                command: { actionId: 'name', revision: 1, operation: 'goal.setName', value: runId },
              },
            ],
          }),
          source.head('owner'),
        ]),
      );
      const changes = await source.read('owner', 0);
      expect(changes).toHaveLength(16);
      for (const runId of ids)
        expect(await source.snapshot('owner', runId)).toMatchObject({
          resourceVersion: 2,
          liveActions: [{ command: { value: runId } }],
        });
    } finally {
      const close = (storage as { close?: () => Promise<void> }).close;
      await close?.call(storage);
    }
  });
  it('captures preview and terminal changes atomically, isolates owners and survives a new process connection', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memoflow-workflow-events-'));
    const url = `file:${join(dir, 'workflow.db')}`;
    const storage = createMastraStorage({ kind: 'libsql', url });
    const observer = createClient({ url });
    try {
      await storage.init();
      const source = getGoalWorkflowEventSource(storage);
      expect(source).toBeDefined();
      if (!source) throw new Error('Goal event journal is unavailable');
      const workflows = await storage.getStore('workflows');
      if (!workflows) throw new Error('Workflow storage is unavailable');
      const controller = new AbortController();
      const stream = workspaceEventStream({
        source,
        identityId: 'owner',
        signal: controller.signal,
      });
      const ready = await stream.next();
      expect(ready.value).toMatchObject({ type: 'stream.ready' });
      if (!ready.value) throw new Error('Goal stream did not become ready');
      const initialCursor = ready.value.cursor;
      const firstEvent = stream.next();
      const snapshot = {
        status: 'running',
        context: { input: { idea: 'Plan', identityId: 'owner', conversationId: 'thread' } },
        value: { liveActions: [] },
      };
      const wake = vi.fn();
      const unsubscribe = source.subscribe(wake);
      const unsubscribeBroken = source.subscribe(() => {
        throw new Error('Broken transport wake');
      });
      await workflows.persistWorkflowSnapshot({
        workflowName: 'goal-create',
        runId: 'other-run',
        resourceId: 'other-owner',
        snapshot: {
          ...snapshot,
          context: { input: { ...snapshot.context.input, identityId: 'other-owner' } },
        } as unknown as WorkflowRunState,
      });
      await workflows.persistWorkflowSnapshot({
        workflowName: 'goal-create',
        runId: 'run-1',
        resourceId: 'owner',
        snapshot: snapshot as unknown as WorkflowRunState,
      });
      expect(await source.read('owner', 0)).toHaveLength(1);
      expect((await firstEvent).value).toMatchObject({
        type: 'workflow.updated',
        resourceVersion: 1,
      });
      controller.abort();
      await stream.return(undefined);
      expect(wake).toHaveBeenCalled();
      unsubscribe();
      unsubscribeBroken();
      await workflows.persistWorkflowSnapshot({
        workflowName: 'goal-create',
        runId: 'run-1',
        resourceId: 'owner',
        snapshot: { ...snapshot, privateEngineMetadata: 'changed' } as unknown as WorkflowRunState,
      });
      expect(await source.read('owner', 0)).toHaveLength(1);
      expect(await source.read('foreign-owner', 0)).toEqual([]);
      const action = {
        sequence: 1,
        command: {
          actionId: 'name',
          revision: 1,
          operation: 'goal.setName' as const,
          value: 'Native Goal',
        },
      };
      await publishRunningGoalActions({
        storage,
        identityId: 'owner',
        runId: 'run-1',
        journal: [action],
      });
      const changes = await source.read('owner', 0);
      expect(changes.at(-1)).toMatchObject({
        resourceVersion: 2,
        actions: [action],
        baseActionSequence: 0,
        lastActionSequence: 1,
      });
      await observer.execute({
        sql: "UPDATE mastra_workflow_snapshot SET snapshot=json_set(snapshot,'$.goalLiveActions',json(?)) WHERE run_id=?",
        args: [
          JSON.stringify([
            {
              command: {
                value: 'Native Goal',
                operation: 'goal.setName',
                revision: 1,
                actionId: 'name',
              },
              sequence: 1,
            },
          ]),
          'run-1',
        ],
      });
      expect(await source.read('owner', 0)).toHaveLength(changes.length);
      const transaction = await observer.transaction('write');
      await transaction.execute({
        sql: 'UPDATE mastra_workflow_snapshot SET snapshot=jsonb(?) WHERE run_id=?',
        args: [JSON.stringify({ ...snapshot, status: 'canceled' }), 'run-1'],
      });
      await transaction.rollback();
      transaction.close();
      expect(await source.head('owner')).toMatchObject({ last: changes.at(-1)!.sequence });
      await workflows.persistWorkflowSnapshot({
        workflowName: 'goal-create',
        runId: 'run-1',
        resourceId: 'owner',
        snapshot: {
          ...snapshot,
          status: 'failed',
          value: {
            liveActions: [],
            priorReceipt: {
              workflowRunId: 'run-1',
              revision: 1,
              status: 'success',
              retryable: false,
              referenceMap: { goal: 'saved-goal' },
            },
          },
          error: new AIWorkflowPublicError({
            statusCode: 429,
            responseBody: JSON.stringify({
              error: { code: 'insufficient_quota', message: 'PRIVATE_KEY' },
            }),
          }),
        } as unknown as WorkflowRunState,
      });
      expect(await source.snapshot('owner', 'run-1')).toMatchObject({
        status: 'failed',
        liveActions: [action],
        failure: { code: 'RATE_LIMITED', details: { limitKind: 'quota_exhausted' } },
        result: { referenceMap: { goal: 'saved-goal' } },
      });
      expect(await source.snapshot('foreign-owner', 'run-1')).toBeNull();
      expect(JSON.stringify(await source.read('owner', 0))).not.toContain('PRIVATE_KEY');
      const replayController = new AbortController();
      const replay = workspaceEventStream({
        source,
        identityId: 'owner',
        cursor: initialCursor,
        signal: replayController.signal,
      });
      expect((await replay.next()).value).toMatchObject({ type: 'stream.ready' });
      const replayed = [await replay.next(), await replay.next(), await replay.next()];
      expect(
        replayed.map((event) =>
          event.value && 'resourceVersion' in event.value ? event.value.resourceVersion : null,
        ),
      ).toEqual([1, 2, 3]);
      replayController.abort();
      await replay.return(undefined);
      const foreign = workspaceEventStream({
        source,
        identityId: 'foreign-owner',
        cursor: initialCursor,
        signal: new AbortController().signal,
      });
      expect((await foreign.next()).value).toMatchObject({
        type: 'stream.reset_required',
        reason: 'invalid',
      });
      await foreign.return(undefined);
      await expect(
        observer.execute({
          sql: 'UPDATE mastra_workflow_snapshot SET resourceId=? WHERE run_id=?',
          args: ['foreign-owner', 'run-1'],
        }),
      ).rejects.toThrow('Goal workflow owner cannot change');
      const restarted = createMastraStorage({ kind: 'libsql', url });
      try {
        await restarted.init();
        const restored = getGoalWorkflowEventSource(restarted)!;
        expect(restored.epoch).toBe(source.epoch);
        expect(await restored.read('owner', changes.at(-1)!.sequence)).toHaveLength(1);
        await observer.execute({
          sql: 'UPDATE memoflow_goal_events SET captured_at=? WHERE identity_id=? AND resource_version=1',
          args: [Date.now() - 8 * 86_400_000, 'owner'],
        });
        const retained = await restored.head('owner');
        expect(retained.first).toBeGreaterThan(1);
        const expired = workspaceEventStream({
          source: restored,
          identityId: 'owner',
          cursor: initialCursor,
          signal: new AbortController().signal,
        });
        expect((await expired.next()).value).toMatchObject({
          type: 'stream.reset_required',
          reason: 'expired',
        });
        await expired.return(undefined);
      } finally {
        const close = (restarted as { close?: () => Promise<void> }).close;
        await close?.call(restarted);
      }
    } finally {
      observer.close();
      const close = (storage as { close?: () => Promise<void> }).close;
      await close?.call(storage);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
