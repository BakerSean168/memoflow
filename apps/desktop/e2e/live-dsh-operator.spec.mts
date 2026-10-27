import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { verifyInstalledNativeBinary } from './support/installed-native-provenance';
import { AIChannels, AIStreamChannels } from '@memoflow/desktop-contracts';
import { createIsolatedNativeAgentEnvironment } from './packaged-runtime/isolated-native-env';

type Rpc = { ok: boolean; data?: unknown; error?: { code: string } };
type RuntimeEvent = {
  type: string;
  data?: { content?: string; code?: string; message?: string };
  runId?: string;
  conversationId?: string;
};
type WindowBridge = {
  electronAPI: {
    invoke(channel: string, ...args: unknown[]): Promise<Rpc>;
    on(
      channel: string,
      callback: (payload: { streamId: string; event?: RuntimeEvent; code?: string }) => void,
    ): void;
  };
  __liveAssistant: Array<{ streamId: string; event?: RuntimeEvent; code?: string }>;
  __liveErrors: Array<{ streamId: string; code?: string }>;
};

test('operator-approved Windows DSH Flash Send through Desktop IPC and durable history', async () => {
  test.skip(
    process.env.MEMOFLOW_RUN_LIVE_DSH_QA !== 'CONFIRM_ONE_PAID_REQUEST',
    'Requires explicit operator opt-in; never spend quota in automated CI',
  );
  test.skip(process.platform !== 'win32', 'Windows native Desktop acceptance');
  test.setTimeout(115_000);
  const installedExecutable = process.env.MEMOFLOW_PACKAGED_EXECUTABLE;
  // A non-dev acceptance must be bound to a verified, unchanged installed exe.
  if (installedExecutable) {
    expect(process.env.MEMOFLOW_QA_EXPECTED_EXE_SHA256).toMatch(/^[0-9a-f]{64}$/i);
    expect(process.env.MEMOFLOW_QA_EXPECTED_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-windows-live-dsh-'));
  const executable = process.env.MEMOFLOW_QA_DSH_EXECUTABLE;
  expect(executable, 'Windows npm DSH launcher required').toBeTruthy();
  expect(fs.existsSync(executable!)).toBe(true);
  const qaEnv = createIsolatedNativeAgentEnvironment(root);
  // MemoFlow data and other provider homes stay isolated; DSH intentionally uses
  // only the operator-approved existing Windows native auth in USERPROFILE.
  delete qaEnv.DSH_HOME;
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
        ...qaEnv,
        MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: path.join(root, 'user-data'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        NODE_ENV: 'test',
      },
    });
    const main = await app.firstWindow({ timeout: 30000 });
    await expect(main.getByTestId('app-shell')).toBeVisible({ timeout: 30000 });
    let preload = path.resolve('dist-electron/preload.cjs');
    if (installedExecutable) {
      const proof = await verifyInstalledNativeBinary(
        app,
        installedExecutable,
        process.env.MEMOFLOW_QA_EXPECTED_EXE_SHA256!,
        process.env.MEMOFLOW_QA_EXPECTED_VERSION!,
      );
      preload = proof.preloadPath;
      await test.info().attach('installed-native-provenance', {
        body: Buffer.from(
          JSON.stringify({
            packaged: proof.packaged,
            version: proof.version,
            executableSha256: proof.executableSha256,
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
      await view.loadURL(
        'data:text/html;charset=utf-8,<html><body>Authorized DSH live QA</body></html>',
      );
    }, preload);
    const view = (await app.windows()).find((p) => p.url().startsWith('data:text/html'));
    expect(view, 'isolated IPC probe window').toBeDefined();
    const page = view!;
    const ch = AIChannels;
    const streams = AIStreamChannels;
    await page.evaluate(
      ({ events, errors }) => {
        const win = window as unknown as WindowBridge;
        win.__liveAssistant = [];
        win.__liveErrors = [];
        win.electronAPI.on(events, (p) => win.__liveAssistant.push(p));
        win.electronAPI.on(errors, (p) => win.__liveErrors.push(p));
      },
      { events: streams.RUNTIME_ASSISTANT_EVENT, errors: streams.RUNTIME_ASSISTANT_ERROR },
    );

    const saved = await page.evaluate(
      ({ channel, executable }) =>
        (window as unknown as WindowBridge).electronAPI.invoke(channel, {
          action: 'save_connection',
          connection: {
            driver: 'dsh',
            name: 'Authorized DSH Windows QA',
            executablePath: executable,
            enabled: true,
            writeScopes: [],
          },
        }),
      { channel: ch.LOCAL_AGENT, executable },
    );
    if (!saved.ok) throw new Error('SAVE_CONNECTION_' + String(saved.error?.code || 'unknown'));
    const connectionId = (saved.data as { id: string }).id;
    expect(connectionId).toBeTruthy();

    const probe = await page.evaluate(
      ({ channel, id }) =>
        (window as unknown as WindowBridge).electronAPI.invoke(channel, {
          action: 'probe_connection',
          id,
        }),
      { channel: ch.LOCAL_AGENT, id: connectionId },
    );
    if (!probe.ok) throw new Error('PROBE_IPC_' + String(probe.error?.code || 'unknown'));
    const status = probe.data as { status: string; models?: Array<{ id: string }> };
    const modelId = '["deepseek-account","deepseek-flash"]';
    console.log(
      'MEMOFLOW_DSH_PROBE=' +
        JSON.stringify({
          status: status.status,
          modelCount: status.models?.length ?? 0,
          targetAvailable: status.models?.some((x) => x.id === modelId) === true,
        }),
    );
    if (status.status !== 'ready') throw new Error('PROVIDER_NOT_READY_' + status.status);
    if (!status.models?.some((m) => m.id === modelId)) throw new Error('FLASH_MODEL_NOT_AVAILABLE');

    const create = await page.evaluate(
      ({ channel, connectionId, modelId }) =>
        (window as unknown as WindowBridge).electronAPI.invoke(channel, {
          action: 'create_conversation',
          conversation: { connectionId, modelId, name: 'One-shot Windows DSH QA' },
        }),
      { channel: ch.LOCAL_AGENT, connectionId, modelId },
    );
    if (!create.ok)
      throw new Error('CREATE_CONVERSATION_' + String(create.error?.code || 'unknown'));
    const conversationId = (create.data as { id: string }).id;
    expect(conversationId).toBeTruthy();

    // Exactly ONE Send through MemoFlow's real local-agent runtime.
    const streamId = 'dsh-qa-one-shot';
    const send = await page.evaluate(
      ({ channel, conversationId, modelId, streamId }) =>
        (window as unknown as WindowBridge).electronAPI.invoke(channel, {
          streamId,
          command: {
            type: 'message',
            runtimeKind: 'local_agent',
            surface: 'desktop',
            conversationId,
            modelId,
            permissionMode: 'supervised',
            content: '一次 MemoFlow 低成本验收。请仅回复“收到”，不要调用工具或写入任何内容。',
          },
        }),
      { channel: ch.RUNTIME_ASSISTANT_START, conversationId, modelId, streamId },
    );
    console.log('MEMOFLOW_DSH_SEND_ACCEPTED=' + String(send.ok));
    if (!send.ok) throw new Error('SEND_REJECTED_' + String(send.error?.code || 'unknown'));

    await page.waitForFunction(
      (id) => {
        const win = window as unknown as WindowBridge;
        return (
          win.__liveAssistant.some(
            (e) =>
              e.streamId === id &&
              [
                'assistant.run.completed',
                'assistant.run.failed',
                'assistant.run.cancelled',
              ].includes(e.event?.type || ''),
          ) || win.__liveErrors.some((e) => e.streamId === id)
        );
      },
      streamId,
      { timeout: 70000 },
    );

    const response = await page.evaluate((id) => {
      const win = window as unknown as WindowBridge;
      const messages = win.__liveAssistant
        .filter((x) => x.streamId === id)
        .map((x) => x.event)
        .filter(Boolean) as RuntimeEvent[];
      const terminal = messages.find((x) =>
        ['assistant.run.completed', 'assistant.run.failed', 'assistant.run.cancelled'].includes(
          x.type,
        ),
      );
      return {
        type: terminal?.type || 'transport_error',
        failureCode:
          terminal?.type === 'assistant.run.failed'
            ? terminal.data?.code
            : win.__liveErrors.find((x) => x.streamId === id)?.code || null,
        text: terminal?.type === 'assistant.run.completed' ? terminal.data?.content || '' : null,
        streamedText: messages
          .filter((x) => x.type === 'assistant.message.delta')
          .map((x) => x.data?.content || '')
          .join(''),
        eventTypes: messages.map((x) => x.type),
      };
    }, streamId);
    console.log(
      'MEMOFLOW_DSH_RUNTIME=' +
        JSON.stringify({
          type: response.type,
          failureCode: response.failureCode,
          replyChars: response.text?.length,
          streamMatchesCompletion: response.streamedText === response.text,
          eventTypes: response.eventTypes,
        }),
    );
    expect(response.type).toBe('assistant.run.completed');
    expect(response.text?.length).toBeGreaterThan(0);
    expect(response.streamedText).toBe(response.text);

    const history = await page.evaluate(
      ({ channel, conversationId }) =>
        (window as unknown as WindowBridge).electronAPI.invoke(channel, {
          runtimeKind: 'local_agent',
          conversationId,
        }),
      { channel: ch.RUNTIME_ASSISTANT_HISTORY, conversationId },
    );
    if (!history.ok) throw new Error('HISTORY_' + String(history.error?.code || 'unknown'));
    const data = history.data as { messages?: Array<{ role: string; content: string }> };
    const roles = (data.messages || []).map((m) => m.role);
    const assistantMessage = (data.messages || []).filter((m) => m.role === 'assistant').at(-1);
    console.log(
      'MEMOFLOW_DSH_PERSISTED=' +
        JSON.stringify({
          roles,
          assistantMatchesCompletion: assistantMessage?.content === response.text,
        }),
    );
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
    expect(assistantMessage?.content).toBe(response.text);
    console.log('MEMOFLOW_DSH_LIVE_E2E_PASS');
  } finally {
    if (app) await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
