import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import express from 'express';
import type { WorkflowRunState } from '@mastra/core/workflows';
import { describe, expect, it } from 'vitest';
import { WorkspaceEventSchema } from '@memoflow/contracts/ai';
import type { AIWorkflowRuntimePort } from '../../server/mastra/runtime';
import { createMastraStorage } from '../../server/mastra/runtime/storage';
import { getGoalWorkflowEventSource } from '../../server/mastra/runtime/goal-workflow-events.registry';
import { registerAIRuntimeRoutes } from './ai-runtime.routes';
import { parseSSE } from '../../shared/parse-sse';

const executeFile = promisify(execFile);

describe('authenticated Workspace SSE over HTTP and a separate database writer process', () => {
  it('pushes committed field changes and replays a missed terminal transition without leaking another identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memoflow-workspace-sse-'));
    const url = `file:${join(directory, 'workflow.db')}`;
    const storage = createMastraStorage({ kind: 'libsql', url });
    const app = express();
    const source = getGoalWorkflowEventSource(storage)!;
    const unsupported = async (): Promise<never> => {
      throw new Error('Unused workflow command in stream fixture');
    };
    const runtime: AIWorkflowRuntimePort = {
      goalEvents: async () => source,
      start: unsupported,
      startDetached: unsupported,
      resume: unsupported,
      resumeDetached: unsupported,
      get: unsupported,
      list: unsupported,
      cancel: unsupported,
      goalSurfaceLease: unsupported,
    };
    app.use(
      '/ai/runtime',
      registerAIRuntimeRoutes(
        null,
        {
          auth: (req, res, next) => {
            const identityId =
              req.header('Authorization') === 'Bearer owner-fixture'
                ? 'owner'
                : req.header('Authorization') === 'Bearer foreign-fixture'
                  ? 'foreign'
                  : null;
            if (!identityId) {
              res.sendStatus(401);
              return;
            }
            Object.assign(req, { user: { identityId } });
            next();
          },
        },
        runtime,
      ),
    );
    const server = app.listen(0, '127.0.0.1');
    const listening = once(server, 'listening');
    const connections: AbortController[] = [];
    try {
      await listening;
      await storage.init();
      const workflows = await storage.getStore('workflows');
      if (!workflows) throw new Error('Workflow storage unavailable');
      await workflows.persistWorkflowSnapshot({
        workflowName: 'goal-create',
        runId: 'run',
        resourceId: 'owner',
        snapshot: {
          status: 'running',
          context: { input: { idea: 'Plan', identityId: 'owner', conversationId: 'thread' } },
          value: { liveActions: [] },
        } as unknown as WorkflowRunState,
      });
      const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ai/runtime/workspace/sse`;
      expect((await fetch(endpoint)).status).toBe(401);
      const open = async (identity = 'owner', cursor?: string) => {
        const controller = new AbortController();
        connections.push(controller);
        const response = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${identity}-fixture`,
            ...(cursor ? { 'Last-Event-ID': cursor } : {}),
          },
          signal: controller.signal,
        });
        expect(response.status).toBe(200);
        const frames = parseSSE(response);
        const next = async () => {
          const frame = await frames.next();
          if (!frame.value || frame.value.event !== 'workspace')
            throw new Error('Missing Workspace SSE frame');
          return WorkspaceEventSchema.parse(JSON.parse(frame.value.data));
        };
        return { controller, frames, next };
      };
      const live = await open();
      const ready = await live.next();
      expect(ready.type).toBe('stream.ready');
      // The child uses only SQL; no shared JavaScript EventBus can wake this subscription.
      const write = async (terminal: boolean) =>
        executeFile(process.execPath, [
          '--input-type=module',
          '-e',
          `
        import { createClient } from '@libsql/client';
        const client=createClient({url:process.argv[1]});
        try {
          await client.execute({sql: process.argv[2]==='terminal'
            ? "UPDATE mastra_workflow_snapshot SET snapshot=json_set(snapshot,'$.status','canceled') WHERE run_id='run'"
            : "UPDATE mastra_workflow_snapshot SET snapshot=json_set(snapshot,'$.goalLiveActions',json(?)) WHERE run_id='run'",
            args: process.argv[2]==='terminal' ? [] : [JSON.stringify([{sequence:1,command:{actionId:'name',revision:1,operation:'goal.setName',value:'Committed draft'}}])]});
        } finally { client.close(); }
      `,
          url,
          terminal ? 'terminal' : 'preview',
        ]);
      await write(false);
      const preview = await live.next();
      expect(preview).toMatchObject({
        type: 'workflow.updated',
        resourceVersion: 2,
        actions: [{ command: { value: 'Committed draft' } }],
      });
      live.controller.abort();
      await live.frames.return();
      await write(true);
      const replay = await open('owner', preview.cursor);
      expect((await replay.next()).type).toBe('stream.ready');
      expect(await replay.next()).toMatchObject({
        type: 'workflow.updated',
        resourceVersion: 3,
        data: { status: 'cancelled' },
        baseActionSequence: 1,
        lastActionSequence: 1,
      });
      replay.controller.abort();
      await replay.frames.return();
      const foreign = await open('foreign', preview.cursor);
      const rejected = await foreign.next();
      expect(rejected).toMatchObject({ type: 'stream.reset_required', reason: 'invalid' });
      expect(rejected).not.toHaveProperty('data');
      foreign.controller.abort();
      await foreign.frames.return();
    } finally {
      for (const connection of connections) connection.abort();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      const close = (storage as { close?: () => Promise<void> }).close;
      await close?.call(storage);
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);
});
