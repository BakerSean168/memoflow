import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { AIChannels, AIStreamChannels } from '@memoflow/contracts/electron';
import { createIsolatedNativeAgentEnvironment } from './packaged-runtime/isolated-native-env';
import { verifyInstalledNativeBinary } from './support/installed-native-provenance';

interface AttentionQaEnvelope {
  streamId: string;
  event: {
    type: string;
    cursor?: string;
    eventId?: string;
    resourceVersion?: number;
    data?: {
      code?: string;
      message?: string;
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

const nativeFailureCases = [
  { mode: 'unavailable', expectedCode: 'LOCAL_AGENT_UNAVAILABLE' },
  { mode: 'rate_limited', expectedCode: 'LOCAL_AGENT_RATE_LIMITED' },
  { mode: 'quota_exhausted', expectedCode: 'LOCAL_AGENT_QUOTA_EXHAUSTED' },
] as const;

async function verifyOfflineNativeFailure(
  scenario: (typeof nativeFailureCases)[number],
  driver: 'dsh' | 'antigravity',
) {
  test.skip(process.platform !== 'win32', 'Real Windows Desktop IPC test');
  test.setTimeout(90_000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-attention-qa-'));
  const promptLog = path.join(root, 'native-prompts.log');
  const env = createIsolatedNativeAgentEnvironment(root);
  const installedExecutable = process.env.MEMOFLOW_PACKAGED_EXECUTABLE;
  if (driver === 'antigravity') {
    const authDir = path.join(env.GEMINI_HOME!, 'antigravity-acp');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(
      path.join(authDir, 'acp_token.json'),
      JSON.stringify({ client_id: 'fixture', refresh_token: 'offline-only' }),
    );
  }
  const fixture = path.resolve('e2e/support/attention-acp-fixture.cjs');
  expect(fs.existsSync(fixture)).toBe(true);
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({
      ...(installedExecutable ? { executablePath: installedExecutable } : {}),
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        ...(installedExecutable ? [] : [path.resolve('dist-electron/main.cjs')]),
      ],
      cwd: process.cwd(),
      env: {
        ...env,
        MEMOFLOW_ATTENTION_QA_FIXTURE: '1',
        MEMOFLOW_ATTENTION_QA_FAILURE: scenario.mode,
        MEMOFLOW_ATTENTION_QA_PROMPT_LOG: promptLog,
        NODE_ENV: 'test',
        MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: path.join(root, 'user-data'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });
    const main = await app.firstWindow({ timeout: 30000 });
    await expect(main.getByTestId('app-shell')).toBeVisible({ timeout: 30000 });
    let preload = path.resolve('dist-electron/preload.cjs');
    if (installedExecutable) {
      const receipt = await verifyInstalledNativeBinary(
        app,
        installedExecutable,
        process.env.MEMOFLOW_QA_EXPECTED_EXE_SHA256!,
        process.env.MEMOFLOW_QA_EXPECTED_VERSION!,
      );
      preload = receipt.preloadPath;
      await test.info().attach('installed-workspace-provenance', {
        body: Buffer.from(
          JSON.stringify({
            packaged: receipt.packaged,
            version: receipt.version,
            executableSha256: receipt.executableSha256,
            paidRequests: 0,
          }),
        ),
        contentType: 'application/json',
      });
    }
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
      ({ channel, executablePath, driver }) =>
        (window as unknown as AttentionQaWindow).electronAPI.invoke(channel, {
          action: 'save_connection',
          connection: {
            driver,
            name: 'Offline Attention QA Agent',
            executablePath,
            enabled: true,
            writeScopes: [],
          },
        }),
      { channel: AIChannels.LOCAL_AGENT, executablePath: fixture, driver },
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
    const failures = await probe.evaluate(
      (id) =>
        (window as unknown as AttentionQaWindow).__qaAssistant
          .filter((item) => item.streamId === id && item.event.type === 'assistant.run.failed')
          .map((item) => item.event.data),
      runtimeStreamId,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]?.code).toBe(scenario.expectedCode);
    expect(JSON.stringify(failures)).not.toContain('PRIVATE_ACP_QA_DIAGNOSTIC');
    expect(fs.readFileSync(promptLog, 'utf8')).toBe('1'); // No automatic retry.

    const status = await probe.evaluate(
      ({ channel, id }) =>
        (window as unknown as AttentionQaWindow).electronAPI.invoke(channel, {
          action: 'probe_connection',
          id,
        }),
      { channel: AIChannels.LOCAL_AGENT, id: connectionId },
    );
    expect(status).toMatchObject({ ok: true, data: { status: 'ready' } });
    const failure = (status.data as { lastExecutionFailure?: { code: string; modelId: string } })
      .lastExecutionFailure;
    if (scenario.mode === 'unavailable') expect(failure).toBeUndefined();
    else
      expect(failure).toMatchObject({
        code: scenario.expectedCode,
        modelId: 'attention-qa-model',
      });
    expect(JSON.stringify(status.data)).not.toContain('PRIVATE_ACP_QA_DIAGNOSTIC');

    const history = await probe.evaluate(
      ({ channel, conversationId }) =>
        (window as unknown as AttentionQaWindow).electronAPI.invoke(channel, {
          runtimeKind: 'local_agent',
          conversationId,
        }),
      { channel: AIChannels.RUNTIME_ASSISTANT_HISTORY, conversationId },
    );
    expect(history.ok).toBe(true);
    expect(JSON.stringify(history.data)).not.toContain('PRIVATE_ACP_QA_DIAGNOSTIC');
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
          driver,
          committedWorking: true,
          committedFailure: true,
          workspaceAck: true,
          attentionAckIdempotent: true,
          failureCode: scenario.expectedCode,
          promptRequests: 1,
          syntheticNativeModel: true,
          upstreamQuotaNotTested: true,
        }),
    );
  } finally {
    if (app) await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

for (const driver of ['dsh', 'antigravity'] as const) {
  for (const scenario of nativeFailureCases) {
    test(`Windows Electron persists offline ${driver} ${scenario.mode} without leaking diagnostics`, async () =>
      verifyOfflineNativeFailure(scenario, driver));
  }
}
