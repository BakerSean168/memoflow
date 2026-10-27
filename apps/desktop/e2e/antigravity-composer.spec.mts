import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { AIChannels, AIStreamChannels } from '@memoflow/desktop-contracts';
import { createIsolatedNativeAgentEnvironment } from './packaged-runtime/isolated-native-env';
import { verifyInstalledNativeBinary } from './support/installed-native-provenance';

type Rpc = { ok: boolean; data?: unknown; error?: { code: string } };
type Event = { type: string; conversationId: string; data?: { content?: string; code?: string } };
type BridgeWindow = {
  electronAPI: {
    invoke(channel: string, ...args: unknown[]): Promise<Rpc>;
    on(channel: string, callback: (event: { event: Event }) => void): void;
  };
  __agyEvents: Event[];
};

test('Windows AGY Composer selects, sends, persists and restores its native connection without inference', async () => {
  test.skip(process.platform !== 'win32', 'Real Windows Electron test');
  test.setTimeout(90_000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-agy-composer-'));
  const env = createIsolatedNativeAgentEnvironment(root);
  const authDir = path.join(env.GEMINI_HOME!, 'antigravity-acp');
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(
    path.join(authDir, 'acp_token.json'),
    JSON.stringify({ client_id: 'fixture-client', refresh_token: 'offline-only' }),
  );
  const promptLog = path.join(root, 'prompt-count');
  const fixture = path.resolve('e2e/support/attention-acp-fixture.cjs');
  const packagedExecutable = process.env.MEMOFLOW_PACKAGED_EXECUTABLE;
  if (packagedExecutable) expect(fs.existsSync(packagedExecutable)).toBe(true);
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  const launch = () =>
    electron.launch({
      ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        ...(packagedExecutable ? [] : [path.resolve('dist-electron/main.cjs')]),
      ],
      cwd: process.cwd(),
      env: {
        ...env,
        NODE_ENV: 'test',
        MEMOFLOW_ATTENTION_QA_FIXTURE: '1',
        MEMOFLOW_ATTENTION_QA_FAILURE: 'success',
        MEMOFLOW_ATTENTION_QA_PROMPT_LOG: promptLog,
        MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: path.join(root, 'profile'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });
  try {
    app = await launch();
    const provenance = packagedExecutable
      ? await verifyInstalledNativeBinary(
          app,
          packagedExecutable,
          process.env.MEMOFLOW_QA_EXPECTED_EXE_SHA256!,
          process.env.MEMOFLOW_QA_EXPECTED_VERSION!,
        )
      : await app.evaluate(({ app: application }) => ({
          version: application.getVersion(),
          packaged: application.isPackaged,
        }));
    await test.info().attach('native-runtime-provenance', {
      body: Buffer.from(
        JSON.stringify({
          version: provenance.version,
          packaged: provenance.packaged,
          executableSha256: 'executableSha256' in provenance ? provenance.executableSha256 : null,
          paidRequests: 0,
        }),
      ),
      contentType: 'application/json',
    });
    let page = await app.firstWindow();
    await expect(page.getByTestId('app-shell')).toBeVisible();
    const saved = await page.evaluate(
      ({ channel, executablePath, homePath }) =>
        (window as unknown as BridgeWindow).electronAPI.invoke(channel, {
          action: 'save_connection',
          connection: {
            driver: 'antigravity',
            name: 'AGY Offline Acceptance',
            executablePath,
            homePath,
            enabled: true,
            writeScopes: [],
          },
        }),
      { channel: AIChannels.LOCAL_AGENT, executablePath: fixture, homePath: env.GEMINI_HOME! },
    );
    expect(saved.ok).toBe(true);
    const connectionId = (saved.data as { id: string }).id;
    const selected = await page.evaluate(
      ({ channel, connectionId }) =>
        (window as unknown as BridgeWindow).electronAPI.invoke(channel, {
          action: 'set_default',
          choice: {
            runtimeKind: 'local_agent',
            connectionId,
            modelId: 'attention-qa-model',
          },
        }),
      { channel: AIChannels.LOCAL_AGENT, connectionId },
    );
    expect(selected.ok).toBe(true);
    await page.reload();
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await expect(page.getByTestId('ai-chat-composer')).toBeVisible();
    await page.evaluate((channel) => {
      const win = window as unknown as BridgeWindow;
      win.__agyEvents = [];
      win.electronAPI.on(channel, (message) => win.__agyEvents.push(message.event));
    }, AIStreamChannels.RUNTIME_ASSISTANT_EVENT);
    const picker = page.getByTestId('ai-chat-model-selector');
    await picker.click();
    await page.getByTestId(`ai-model-picker-agent-local:${connectionId}`).click();
    await page
      .getByTestId('ai-model-picker-option')
      .filter({ hasText: 'Offline Attention Fixture' })
      .click();
    await expect(picker).toContainText('Offline Attention Fixture');
    await page.getByTestId('ai-chat-composer').fill('Offline AGY Composer acceptance');
    await expect(page.getByTestId('ai-chat-send-message')).toBeEnabled();
    await page.getByTestId('ai-chat-send-message').click();
    await page.waitForFunction(() =>
      (window as unknown as BridgeWindow).__agyEvents.some(
        (event) => event.type === 'assistant.run.completed',
      ),
    );
    const completed = await page.evaluate(() =>
      (window as unknown as BridgeWindow).__agyEvents.find(
        (event) => event.type === 'assistant.run.completed',
      )!,
    );
    expect(completed.data?.content).toBe('Offline AGY response');
    expect(fs.readFileSync(promptLog, 'utf8')).toBe('1');
    const history = await page.evaluate(
      ({ channel, conversationId }) =>
        (window as unknown as BridgeWindow).electronAPI.invoke(channel, {
          runtimeKind: 'local_agent',
          conversationId,
        }),
      { channel: AIChannels.RUNTIME_ASSISTANT_HISTORY, conversationId: completed.conversationId },
    );
    expect(history).toMatchObject({
      ok: true,
      data: {
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Offline AGY Composer acceptance' }),
          expect.objectContaining({ role: 'assistant', content: 'Offline AGY response' }),
        ]),
      },
    });
    await app.close();
    app = undefined;
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByTestId('app-shell')).toBeVisible();
    const restored = await page.evaluate(
      (channel) =>
        (window as unknown as BridgeWindow).electronAPI.invoke(channel, {
          action: 'list_connections',
        }),
      AIChannels.LOCAL_AGENT,
    );
    expect(restored).toMatchObject({
      ok: true,
      data: [expect.objectContaining({ id: connectionId, driver: 'antigravity' })],
    });
    const persisted = await page.evaluate(
      ({ channel, conversationId }) =>
        (window as unknown as BridgeWindow).electronAPI.invoke(channel, {
          runtimeKind: 'local_agent',
          conversationId,
        }),
      { channel: AIChannels.RUNTIME_ASSISTANT_HISTORY, conversationId: completed.conversationId },
    );
    expect(persisted).toEqual(history);
    expect(fs.readFileSync(promptLog, 'utf8')).toBe('1');
  } finally {
    if (app) await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
