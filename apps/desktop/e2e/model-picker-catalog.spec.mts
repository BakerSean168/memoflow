import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { AIChannels } from '@memoflow/contracts/electron';
import {
  AgentRegistrySnapshotSchema,
  LocalAgentConnectionSchema,
  type LocalAgentConnection,
} from '@memoflow/contracts/ai';
import { createIsolatedNativeAgentEnvironment } from './packaged-runtime/isolated-native-env';

type Bridge = {
  electronAPI: {
    invoke(channel: string, command: unknown): Promise<{ ok: boolean; data?: unknown }>;
  };
};

// Real Electron renderer/preload/IPC/SQLite/Registry and native ACP discovery.
// Only the external Agent process is an offline protocol fixture; no inference is sent.
test('native picker browses a different enabled instance, directly selects its discovered model and hides disabled favorites', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-model-picker-'));
  const environment = createIsolatedNativeAgentEnvironment(root);
  const authDir = path.join(environment.GEMINI_HOME!, 'antigravity-acp');
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(
    path.join(authDir, 'acp_token.json'),
    JSON.stringify({ client_id: 'fixture', refresh_token: 'offline-only' }),
  );
  if (process.platform !== 'win32') fs.chmodSync(path.resolve('e2e/support/attention-acp-fixture.cjs'), 0o755);
  const promptLog = path.join(root, 'prompts');
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        ...(process.platform === 'linux' && process.env.MEMOFLOW_E2E_USE_GNOME_KEYRING === '1'
          ? ['-r', path.resolve('e2e/support/real-keyring-playwright-loader.cjs')]
          : []),
        ...(process.platform === 'linux'
          ? ['--no-sandbox', '--password-store=gnome-libsecret']
          : []),
        path.resolve('dist-electron/main.cjs'),
      ],
      cwd: process.cwd(),
      env: {
        ...environment,
        // The native credential scrubber also removes XAUTHORITY; Electron still
        // needs this test-owned Xvfb cookie path to connect to the display.
        ...(process.env.XAUTHORITY ? { XAUTHORITY: process.env.XAUTHORITY } : {}),
        NODE_ENV: 'test',
        MEMOFLOW_ATTENTION_QA_FIXTURE: '1',
        MEMOFLOW_ATTENTION_QA_PROMPT_LOG: promptLog,
        MEMOFLOW_DESKTOP_USER_DATA_PATH: path.join(root, 'profile'),
        MEMOFLOW_DESKTOP_USER_FILES_PATH: path.join(root, 'files'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });
    expect(
      await app.evaluate(async ({ app, safeStorage }) => {
        await app.whenReady();
        return safeStorage.isEncryptionAvailable();
      }),
    ).toBe(true);
    const page = await app.firstWindow();
    await expect(page.getByTestId('app-shell')).toBeVisible();
    const invoke = async (channel: string, command: unknown) => {
      const result = await page.evaluate(
        ({ channel, command }) =>
          (window as unknown as Bridge).electronAPI.invoke(channel, command),
        { channel, command },
      );
      expect(result.ok).toBe(true);
      return result.data;
    };
    const connections: LocalAgentConnection[] = [];
    for (const slug of ['picker-first', 'picker-second']) {
      const saved = await invoke(AIChannels.LOCAL_AGENT, {
        action: 'save_connection',
        connection: {
          driver: 'antigravity',
          instanceSlug: slug,
          name: slug,
          executablePath: path.resolve('e2e/support/attention-acp-fixture.cjs'),
          homePath: environment.GEMINI_HOME!,
          enabled: true,
          writeScopes: [],
        },
      });
      connections.push(LocalAgentConnectionSchema.parse(saved));
    }
    const snapshot = AgentRegistrySnapshotSchema.parse(
      await invoke(AIChannels.AGENT_INSTANCE, { action: 'list' }),
    );
    for (const instance of snapshot.instances.filter(
      (entry) => !entry.instanceId.startsWith('picker-'),
    )) {
      await invoke(AIChannels.AGENT_INSTANCE, {
        action: 'update',
        instanceId: instance.instanceId,
        expectedRevision: instance.revision,
        patch: { enabled: false },
      });
    }
    await invoke(AIChannels.LOCAL_AGENT, {
      action: 'set_default',
      choice: {
        runtimeKind: 'local_agent',
        connectionId: connections[0]!.id,
        modelId: 'attention-qa-model',
      },
    });
    await page.reload();
    const picker = page.getByTestId('ai-chat-model-selector');
    await expect(picker).toContainText('Offline Attention Fixture');
    await expect(picker).toHaveAttribute('title', /picker-first/);
    await page.getByTestId('ai-chat-composer').fill('Keep native draft');
    const before = await invoke(AIChannels.LOCAL_AGENT, { action: 'list_connections' });
    await picker.click();
    await page.getByTestId(`ai-model-picker-agent-local:${connections[1]!.id}`).click();
    await expect(page.getByTestId('ai-model-picker-option')).toContainText('picker-second');
    await expect(page.getByTestId('ai-model-picker-option')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByTestId('ai-chat-composer')).toHaveValue('Keep native draft');
    expect(await invoke(AIChannels.LOCAL_AGENT, { action: 'list_connections' })).toEqual(before);
    expect(fs.existsSync(promptLog)).toBe(false);
    await expect(page.getByTestId('ai-model-picker-select-agent')).toHaveCount(0);
    await page.getByTestId('ai-model-picker-toggle-favorite').click();
    await page.getByTestId('ai-model-picker-option').click();
    await expect(picker).toHaveAttribute('title', /picker-second/);
    await picker.click();
    await expect(page.getByTestId('ai-model-picker-option')).toContainText('picker-second');
    await expect(page.getByTestId('ai-model-picker-option')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('ai-chat-composer')).toHaveValue('Keep native draft');
    await page.evaluate(() => {
      window.location.hash = '#/settings?tab=ai';
    });
    await page.getByTestId('ai-provider-toggle-picker-second').click();
    await expect(page.getByTestId('ai-provider-toggle-picker-second')).not.toBeChecked();
    await expect(page.getByTestId('ai-provider-select-agent:picker-second')).toBeVisible();
    await page.getByTestId('settings-return-to-app').first().click();
    await picker.click();
    await expect(page.getByTestId(`ai-model-picker-agent-local:${connections[1]!.id}`)).toHaveCount(
      0,
    );
    await page.getByTestId('ai-model-picker-favorites').click();
    await expect(page.getByTestId('ai-model-picker-option')).toHaveCount(0);
    await page.getByTestId('ai-model-picker-search').fill('picker-second');
    await expect(page.getByTestId('ai-model-picker-option')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      window.location.hash = '#/settings?tab=ai';
    });
    await page.getByTestId('ai-provider-toggle-picker-second').click();
    await expect(page.getByTestId('ai-provider-toggle-picker-second')).toBeChecked();
    await page.getByTestId('settings-return-to-app').first().click();
    await picker.click();
    await page.getByTestId('ai-model-picker-favorites').click();
    await expect(page.getByTestId('ai-model-picker-option')).toHaveCount(1);
    await expect(page.getByTestId('ai-model-picker-option')).toContainText('picker-second');
    expect(fs.existsSync(promptLog)).toBe(false);
    expect(await invoke(AIChannels.LOCAL_AGENT, { action: 'list_conversations' })).toEqual([]);
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
