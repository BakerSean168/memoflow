import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { AIChannels } from '@memoflow/desktop-contracts';
import { createIsolatedNativeAgentEnvironment } from './packaged-runtime/isolated-native-env';
import { verifyInstalledNativeBinary } from './support/installed-native-provenance';

type Rpc = {
  ok: boolean;
  data?:
    | {
        status?: string;
        models?: Array<{ id: string; name: string }>;
        account?: { type: string; email?: string };
      }
    | Array<{ id: string; driver: string }>;
  error?: { code: string };
};
type NativeBridge = {
  electronAPI: { invoke(channel: string, ...args: unknown[]): Promise<Rpc> };
};

/**
 * Opt-in only: inspect an operator-approved existing Windows Codex Home.
 * Real model/list and account/read, NEVER thread/start, turn/start or paid inference.
 *
 * Use an isolated MemoFlow Profile, not the user's existing MemoFlow app data.
 * Do not print email, token, auth files, model names or private filesystem paths.
 */
test('operator-approved installed Windows Codex A-B-A Home isolation and native model selection (no Send)', async () => {
  test.skip(process.platform !== 'win32', 'Windows-only Native account acceptance');
  test.skip(
    process.env.MEMOFLOW_RUN_NATIVE_CODEX_QA !== 'CONFIRM_READ_ONLY_ACCOUNT_PROBE',
    'Explicit operator opt-in required; CI never reads a real Codex account',
  );
  test.setTimeout(180_000);

  const executable = process.env.MEMOFLOW_PACKAGED_EXECUTABLE;
  const accountHome = process.env.MEMOFLOW_QA_CODEX_HOME;
  const codex = process.env.MEMOFLOW_QA_CODEX_EXECUTABLE;
  expect(executable, 'An exact-SHA installed memoflow.exe is required').toBeTruthy();
  expect(accountHome, 'Operator-approved existing Codex Home is required').toBeTruthy();
  expect(codex, 'Windows Codex CLI executable is required').toBeTruthy();
  expect(fs.statSync(executable!).isFile()).toBe(true);
  expect(fs.statSync(accountHome!).isDirectory()).toBe(true);
  expect(fs.statSync(codex!).isFile()).toBe(true);
  expect(process.env.MEMOFLOW_QA_EXPECTED_EXE_SHA256).toMatch(/^[0-9a-f]{64}$/i);
  expect(process.env.MEMOFLOW_QA_EXPECTED_VERSION).toMatch(/^\d+\.\d+\.\d+$/);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-codex-operator-'));
  const isolated = createIsolatedNativeAgentEnvironment(root);
  const emptyHome = path.join(root, 'empty-codex-account');
  fs.mkdirSync(emptyHome, { recursive: true });
  const launch = (home: string) =>
    electron.launch({
      executablePath: executable!,
      args: ['--disable-gpu', '--disable-dev-shm-usage'],
      cwd: process.cwd(),
      env: {
        ...isolated,
        CODEX_HOME: home,
        // Resolve the explicitly chosen Windows Codex CLI, not WSL's PATH.
        PATH: path.dirname(codex!) + path.delimiter + (isolated.PATH ?? ''),
        MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: path.join(root, 'profile'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });

  const probe = async (app: ElectronApplication) => {
    const window = await app.firstWindow({ timeout: 45_000 });
    await expect(window.getByTestId('app-shell')).toBeVisible({ timeout: 45_000 });
    const result = await window.evaluate(
      (channel) =>
        (window as unknown as NativeBridge).electronAPI.invoke(channel, {
          action: 'probe_default',
          driver: 'codex',
        }),
      AIChannels.LOCAL_AGENT,
    );
    expect(result.ok).toBe(true);
    return { window, status: result.data as Exclude<Rpc['data'], unknown[]> };
  };

  const connections = async (app: ElectronApplication) =>
    (await (
      await app.firstWindow()
    ).evaluate(
      (channel) =>
        (window as unknown as NativeBridge).electronAPI.invoke(channel, {
          action: 'list_connections',
        }),
      AIChannels.LOCAL_AGENT,
    )) as Rpc;

  let app: ElectronApplication | undefined;
  let selectedId: string | undefined;
  try {
    app = await launch(accountHome!);
    const provenance = await verifyInstalledNativeBinary(
      app,
      executable!,
      process.env.MEMOFLOW_QA_EXPECTED_EXE_SHA256!,
      process.env.MEMOFLOW_QA_EXPECTED_VERSION!,
    );
    await test.info().attach('installed-codex-provenance', {
      body: Buffer.from(
        JSON.stringify({
          version: provenance.version,
          executableSha256: provenance.executableSha256,
          packaged: provenance.packaged,
          inferencing: false,
        }),
      ),
      contentType: 'application/json',
    });
    const first = await probe(app);
    expect(first.status.status).toBe('ready');
    const catalog = first.status.models ?? [];
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.every((model) => model.id.length > 0)).toBe(true);
    expect((await connections(app)).data).toEqual([]);

    // Explicit selection, never a passive probe, materializes the single default.
    const picker = first.window.getByTestId('ai-chat-model-selector');
    await expect(picker).toBeVisible();
    await picker.click();
    // Sidebar browsing is read-only; the explicit Select Agent button
    // materializes the default only after the user confirms the selection.
    await first.window.getByTestId('ai-model-picker-agent-local:codex').click();
    expect((await connections(app)).data).toEqual([]);
    await first.window.getByTestId('ai-model-picker-select-agent').click();
    await expect
      .poll(async () => (await connections(app!)).data as Array<{ id: string; driver: string }>)
      .toEqual([expect.objectContaining({ driver: 'codex' })]);
    const persisted = (await connections(app)).data as Array<{ id: string; driver: string }>;
    expect(persisted).toHaveLength(1);
    selectedId = persisted[0]!.id;
    // Selecting the Agent closes the picker; reopen it for a native Model ID.
    await picker.click();
    await expect(first.window.getByTestId('ai-model-picker-option').first()).toBeVisible();
    await first.window.getByTestId('ai-model-picker-option').first().click();
    await first.window.getByTestId('ai-chat-composer').fill('UNSENT read-only Codex QA draft');
    await expect(first.window.getByTestId('ai-chat-send-message')).toBeEnabled();
    // Intentionally do not click Send; asserting eligibility is not a paid execution.
    console.log(
      'CODEX_OPERATOR_A=' +
        JSON.stringify({
          ready: true,
          modelCount: catalog.length,
          savedConnections: 1,
          paidRequests: 0,
        }),
    );
    await app.close();
    app = undefined;

    // Same isolated MemoFlow Profile, but an empty native home: never leak A's
    // account summary or treat the old real Model Catalog as B's eligibility.
    app = await launch(emptyHome);
    const second = await probe(app);
    expect(second.status.status).toBe('login_required');
    expect(second.status.account).toBeUndefined();
    expect(second.status.models).toBeUndefined();
    const savedB = (await connections(app)).data as Array<{ id: string; driver: string }>;
    expect(savedB).toHaveLength(1);
    expect(savedB[0]!.id).toBe(selectedId);
    await second.window.evaluate(() => {
      window.location.hash = '#/settings?tab=ai';
    });
    const settingsB = second.window.getByTestId('ai-settings-panel');
    await expect(settingsB).toBeVisible({ timeout: 20000 });
    await settingsB.getByTestId('ai-provider-select-agent:codex').click();
    await expect(settingsB.getByTestId('ai-native-auth-summary')).toHaveCount(0);
    console.log(
      'CODEX_OPERATOR_EMPTY_B=' +
        JSON.stringify({
          loginRequired: true,
          noPriorAccountMetadata: true,
          savedConnections: 1,
          paidRequests: 0,
        }),
    );
    await app.close();
    app = undefined;

    app = await launch(accountHome!);
    const restored = await probe(app);
    expect(restored.status.status).toBe('ready');
    expect(restored.status.models?.map((model) => model.id)).toEqual(
      catalog.map((model) => model.id),
    );
    const savedA = (await connections(app)).data as Array<{ id: string; driver: string }>;
    expect(savedA).toHaveLength(1);
    expect(savedA[0]!.id).toBe(selectedId);
    console.log(
      'CODEX_OPERATOR_RESTORED_A=' +
        JSON.stringify({
          ready: true,
          modelCount: catalog.length,
          savedConnections: 1,
          paidRequests: 0,
        }),
    );
  } finally {
    if (app) await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
