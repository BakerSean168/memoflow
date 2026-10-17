import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { AIChannels, AIStreamChannels } from '@memoflow/contracts/electron';
import { createIsolatedNativeAgentEnvironment } from './packaged-runtime/isolated-native-env';

interface AttentionQaEnvelope {
  streamId: string;
  event: {
    type: string;
    cursor?: string;
    eventId?: string;
    resourceVersion?: number;
    data?: {
      conversationId?: string;
      runtimeKind?: string;
      attention?: {
        state: string;
        revision: number;
        seenRevision: number;
        runId: string | null;
      } | null;
    };
  };
}
interface AttentionQaWindow {
  electronAPI: {
    invoke(
      channel: string,
      ...args: unknown[]
    ): Promise<{
      ok: boolean;
      data?: unknown;
      error?: { code: string };
    }>;
    on(channel: string, callback: (payload: AttentionQaEnvelope) => void): void;
  };
  __qaAttention: AttentionQaEnvelope[];
  __qaAssistant: AttentionQaEnvelope[];
}

test('Windows Electron publishes owner-backed attention on offline native run failure', async () => {
  test.skip(process.platform !== 'win32', 'Real Windows Desktop IPC test');
  test.setTimeout(90_000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-attention-qa-'));
  const env = createIsolatedNativeAgentEnvironment(root);
  const fixture = path.resolve('e2e/support/attention-acp-fixture.cjs');
  expect(fs.existsSync(fixture)).toBe(true);
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({
      args: ['--disable-gpu', '--disable-dev-shm-usage', path.resolve('dist-electron/main.cjs')],
      cwd: process.cwd(),
      env: {
        ...env,
        MEMOFLOW_ATTENTION_QA_FIXTURE: '1',
        NODE_ENV: 'test',
        MEMOFLOW_DESKTOP_USER_DATA_PATH: path.join(root, 'user-data'),
        MEMOFLOW_DESKTOP_USER_FILES_PATH: path.join(root, 'user-files'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });
    const main = await app.firstWindow({ timeout: 30000 });
    await expect(main.getByTestId('app-shell')).toBeVisible({ timeout: 30000 });
    const preload = path.resolve('dist-electron/preload.cjs');
    await app.evaluate(async ({ BrowserWindow }, preloadPath) => {
      const view = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
      });
      await view.loadURL('data:text/html;charset=utf-8,<html><body>Attention QA</body></html>');
    }, preload);
    const view = (await app.windows()).find((candidate) =>
      candidate.url().startsWith('data:text/html'),
    );
    expect(view).toBeDefined();
    const probe = view!;
    await probe.evaluate(
      ({ workspaceChannel, assistantChannel }) => {
        const win = window as unknown as AttentionQaWindow;
        win.__qaAttention = [];
        win.__qaAssistant = [];
        win.electronAPI.on(workspaceChannel, (item) => win.__qaAttention.push(item));
        win.electronAPI.on(assistantChannel, (item) => win.__qaAssistant.push(item));
      },
      {
        workspaceChannel: AIStreamChannels.RUNTIME_WORKSPACE_EVENT,
        assistantChannel: AIStreamChannels.RUNTIME_ASSISTANT_EVENT,
      },
    );

    const saved = await probe.evaluate(
      ({ channel, executablePath }) =>
        (window as unknown as AttentionQaWindow).electronAPI.invoke(channel, {
          action: 'save_connection',
          connection: {
            driver: 'dsh',
            name: 'Offline Attention QA Agent',
            executablePath,
            enabled: true,
            writeScopes: [],
          },
        }),
      { channel: AIChannels.LOCAL_AGENT, executablePath: fixture },
    );
    expect(saved).toMatchObject({ ok: true });
    const connectionId = (saved.data as { id: string }).id;
    expect(connectionId).toBeTruthy();

    const conversation = await probe.evaluate(
      ({ channel, connectionId }) =>
        (window as unknown as AttentionQaWindow).electronAPI.invoke(channel, {
          action: 'create_conversation',
          conversation: {
            connectionId,
            modelId: 'attention-qa-model',
            name: 'Offline Attention QA Conversation',
          },
        }),
      { channel: AIChannels.LOCAL_AGENT, connectionId },
    );
    expect(conversation).toMatchObject({ ok: true });
    const conversationId = (conversation.data as { id: string }).id;
    expect(conversationId).toBeTruthy();

    const streamId = 'attention-owner-qa';
    const start = await probe.evaluate(
      ({ channel, streamId }) =>
        (window as unknown as AttentionQaWindow).electronAPI.invoke(channel, { streamId }),
      { channel: AIChannels.RUNTIME_WORKSPACE_START, streamId },
    );
    expect(start).toMatchObject({ ok: true, data: { accepted: true } });
    await probe.waitForFunction(
      (id) =>
        (window as unknown as AttentionQaWindow).__qaAttention.some(
          (e) => e.streamId === id && e.event.type === 'stream.ready',
        ),
      streamId,
      { timeout: 12000 },
    );
    const readyCursor = await probe.evaluate(
      (id) =>
        (window as unknown as AttentionQaWindow).__qaAttention.find(
          (e) => e.streamId === id && e.event.type === 'stream.ready',
        )!.event.cursor!,
      streamId,
    );
    const readyAck = await probe.evaluate(
      ({ channel, streamId, cursor }) =>
        (window as unknown as AttentionQaWindow).electronAPI.invoke(channel, {
          streamId,
          cursor,
        }),
      { channel: AIChannels.RUNTIME_WORKSPACE_ACK, streamId, cursor: readyCursor },
    );
    expect(readyAck).toMatchObject({ ok: true, data: { accepted: true } });

    const runtimeStreamId = 'attention-native-qa';
    const send = await probe.evaluate(
      ({ channel, streamId, conversationId }) =>
        (window as unknown as AttentionQaWindow).electronAPI.invoke(channel, {
          streamId,
          command: {
            type: 'message',
            runtimeKind: 'local_agent',
            surface: 'desktop',
            conversationId,
            content: 'Offline Attention failure-path test. No inference.',
            modelId: 'attention-qa-model',
          },
        }),
      {
        channel: AIChannels.RUNTIME_ASSISTANT_START,
        streamId: runtimeStreamId,
        conversationId,
      },
    );
    expect(send).toMatchObject({ ok: true });

    await probe.waitForFunction(
      (id) =>
        (window as unknown as AttentionQaWindow).__qaAssistant.some(
          (e) => e.streamId === id && e.event.type === 'assistant.run.started',
        ),
      runtimeStreamId,
      { timeout: 15000 },
    );
    await probe.waitForFunction(
      (id) =>
        (window as unknown as AttentionQaWindow).__qaAttention.some(
          (e) => e.streamId === id && e.event.type === 'attention.changed',
        ),
      streamId,
      { timeout: 15000 },
    );
    const working = await probe.evaluate(
      (id) =>
        (window as unknown as AttentionQaWindow).__qaAttention.find(
          (e) => e.streamId === id && e.event.type === 'attention.changed',
        )!.event,
      streamId,
    );
    expect(working.data).toMatchObject({
      conversationId,
      runtimeKind: 'local_agent',
      attention: { state: 'working' },
    });
    expect(working.resourceVersion).toBeGreaterThan(0);
    const workingAck = await probe.evaluate(
      ({ channel, streamId, cursor }) =>
        (window as unknown as AttentionQaWindow).electronAPI.invoke(channel, {
          streamId,
          cursor,
        }),
      { channel: AIChannels.RUNTIME_WORKSPACE_ACK, streamId, cursor: working.cursor! },
    );
    expect(workingAck).toMatchObject({ ok: true, data: { accepted: true } });

    await probe.waitForFunction(
      (id) =>
        (window as unknown as AttentionQaWindow).__qaAssistant.some(
          (e) => e.streamId === id && e.event.type === 'assistant.run.failed',
        ),
      runtimeStreamId,
      { timeout: 15000 },
    );
    await probe.waitForFunction(
      (id) =>
        (window as unknown as AttentionQaWindow).__qaAttention.filter(
          (e) => e.streamId === id && e.event.type === 'attention.changed',
        ).length >= 2,
      streamId,
      { timeout: 15000 },
    );
    const failed = await probe.evaluate(
      (id) =>
        (window as unknown as AttentionQaWindow).__qaAttention.filter(
          (e) => e.streamId === id && e.event.type === 'attention.changed',
        )[1].event,
      streamId,
    );
    expect(failed.data).toMatchObject({
      conversationId,
      runtimeKind: 'local_agent',
      attention: { state: 'failed' },
    });
    expect(failed.resourceVersion).toBeGreaterThan(working.resourceVersion!);
    const failedAck = await probe.evaluate(
      ({ channel, streamId, cursor }) =>
        (window as unknown as AttentionQaWindow).electronAPI.invoke(channel, {
          streamId,
          cursor,
        }),
      { channel: AIChannels.RUNTIME_WORKSPACE_ACK, streamId, cursor: failed.cursor! },
    );
    expect(failedAck).toMatchObject({ ok: true, data: { accepted: true } });

    const list = await probe.evaluate(
      ({ channel, conversationId }) =>
        (window as unknown as AttentionQaWindow).electronAPI.invoke(channel, {
          runtimeKind: 'local_agent',
          conversationIds: [conversationId],
        }),
      { channel: AIChannels.RUNTIME_ASSISTANT_ATTENTION_LIST, conversationId },
    );
    expect(list).toMatchObject({ ok: true });
    const rows = (
      list.data as {
        items: Array<{
          conversationId: string;
          state: string;
          revision: number;
          seenRevision: number;
        }>;
      }
    ).items;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ conversationId, state: 'failed' });
    expect(rows[0].revision).toBeGreaterThan(rows[0].seenRevision);
    const seen = await probe.evaluate(
      ({ channel, conversationId, revision }) =>
        (window as unknown as AttentionQaWindow).electronAPI.invoke(channel, {
          runtimeKind: 'local_agent',
          conversationId,
          revision,
        }),
      {
        channel: AIChannels.RUNTIME_ASSISTANT_ATTENTION_ACK,
        conversationId,
        revision: rows[0].revision,
      },
    );
    expect(seen).toMatchObject({ ok: true, data: { acknowledged: true } });
    const seenAgain = await probe.evaluate(
      ({ channel, conversationId, revision }) =>
        (window as unknown as AttentionQaWindow).electronAPI.invoke(channel, {
          runtimeKind: 'local_agent',
          conversationId,
          revision,
        }),
      {
        channel: AIChannels.RUNTIME_ASSISTANT_ATTENTION_ACK,
        conversationId,
        revision: rows[0].revision,
      },
    );
    expect(seenAgain).toMatchObject({ ok: true, data: { acknowledged: false } });
    console.log(
      'WINDOWS_OWNER_ATTENTION_QA=' +
        JSON.stringify({
          realElectron: true,
          committedWorking: true,
          committedFailure: true,
          workspaceAck: true,
          attentionAckIdempotent: true,
          syntheticNativeModel: true,
          upstreamQuotaNotTested: true,
        }),
    );
  } finally {
    if (app) await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
