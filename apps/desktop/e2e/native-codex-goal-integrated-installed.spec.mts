import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { build as bundleTestRuntime } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';
import type { LocalToolContext } from '@memoflow/ai';
import { AIChannels, GoalChannels } from '@memoflow/contracts/electron';
import type { NativePanelIpcRequest, NativePanelIpcResponse } from '@memoflow/ai-contracts';
import type { createDesktopLocalAgentTools } from '../src/main/modules/ai/local-agent-tools';
import type { IDesktopNativePanelBridge } from '../src/main/modules/ai/desktop-native-panel-bridge';
import { createIsolatedNativeAgentEnvironment } from './packaged-runtime/isolated-native-env';
import { verifyInstalledNativeBinary } from './support/installed-native-provenance';

const execFileAsync = promisify(execFile);
const NAME = 'QA 570 Windows Codex MCP to real Goal owner';

/**
 * Real Windows Codex native App Server -> REAL MemoFlow LocalAgentToolBridge
 * -> test-only Electron IPC relay -> actual installed Vue Goal form -> real
 * isolated local Goal owner store -> cold-start owner/Key Result readback.
 *
 * This tests one continuous tool/RPC data path. The IPC relay (not the shipped
 * DesktopNativePanelBridge) is supplied by the runner; no Codex model turn is
 * started, so this is not a natural-language autonomous-agent acceptance.
 * Never use an existing or cloud-connected Windows Profile.
 */
test('real Windows Codex invokes MemoFlow MCP to fill and save the installed Goal owner', async () => {
  test.skip(process.platform !== 'win32', 'Real Windows installed Desktop acceptance only');
  test.setTimeout(180_000);

  const executable = process.env.MEMOFLOW_PACKAGED_EXECUTABLE;
  const codexExecutable = process.env.MEMOFLOW_QA_NATIVE_CODEX_EXE;
  expect(executable, 'Verified installed MemoFlow binary is required').toBeTruthy();
  expect(codexExecutable, 'Pinned real native Windows Codex executable is required').toBeTruthy();
  expect(fs.existsSync(executable!), 'MemoFlow binary missing').toBe(true);
  expect(fs.existsSync(codexExecutable!), 'Codex binary missing').toBe(true);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-570-codex-integrated-'));
  const isolatedEnv = createIsolatedNativeAgentEnvironment(root);
  const profile = path.join(root, 'profile');
  const bundleRoot = path.join(process.cwd(), 'test-results', `qa-codex-570-${randomUUID()}`);
  const runtimePath = path.join(bundleRoot, 'native-goal-mcp.mjs');
  let fixture: ReturnType<
    (typeof import('../test-support/native-goal-mcp-qa-runtime'))['createPowerSyncSqliteFixture']
  > | null = null;
  let app: ElectronApplication | null = null;
  let bridge: ReturnType<typeof createDesktopLocalAgentTools> | null = null;
  const observedCommands: string[] = [];

  async function launch(): Promise<ElectronApplication> {
    return electron.launch({
      executablePath: executable!,
      args: ['--disable-gpu', '--disable-dev-shm-usage'],
      cwd: process.cwd(),
      env: {
        ...isolatedEnv,
        MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: profile,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });
  }

  async function readGoals(page: Page) {
    const result = await page.evaluate(
      (channel) =>
        (
          window as typeof window & {
            electronAPI: {
              invoke(
                channel: string,
                params: object,
              ): Promise<{
                ok: boolean;
                data?: { pagination: { total: number }; data: Array<{ id: string; name: string }> };
              }>;
            };
          }
        ).electronAPI.invoke(channel, {}),
      GoalChannels.LIST,
    );
    expect(result.ok).toBe(true);
    return result.data!;
  }

  async function readKeyResults(page: Page, goalId: string) {
    const result = await page.evaluate(
      ({ channel, id }) =>
        (
          window as typeof window & {
            electronAPI: {
              invoke(
                channel: string,
                id: string,
              ): Promise<{
                ok: boolean;
                data?: { total: number; data: Array<{ title: string }> };
              }>;
            };
          }
        ).electronAPI.invoke(channel, id),
      { channel: GoalChannels.KEY_RESULT_LIST, id: goalId },
    );
    expect(result.ok).toBe(true);
    return result.data!;
  }

  async function installTestOnlyResponseRelay(instance: ElectronApplication) {
    await instance.evaluate(({ ipcMain, BrowserWindow }, channel) => {
      type Pending = { sender: Electron.WebContents; finish: (response: unknown) => void };
      const state = globalThis as typeof globalThis & {
        __mf570IntegratedPending?: Map<string, Pending>;
      };
      state.__mf570IntegratedPending = new Map();
      // Deliberately isolate this test process. Never inject into the user's
      // installed MemoFlow, and never change its real session or handler.
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, (event, raw: unknown) => {
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        const requestId = (raw as { requestId?: unknown })?.requestId;
        const pending =
          typeof requestId === 'string' ? state.__mf570IntegratedPending?.get(requestId) : null;
        if (!senderWindow?.isVisible() || !pending || pending.sender !== event.sender) {
          return { ok: false };
        }
        pending.finish(raw);
        return { ok: true };
      });
    }, AIChannels.LOCAL_AGENT_PANEL_RESPONSE);
  }

  async function dispatchToActualOwner(
    instance: ElectronApplication,
    context: LocalToolContext,
    command: Parameters<IDesktopNativePanelBridge['executeCommand']>[1],
  ): Promise<NativePanelIpcResponse> {
    if (context.signal.aborted || context.grantSignal.aborted) {
      throw new Error('EXPIRED_NATIVE_GRANT');
    }
    const request: NativePanelIpcRequest = {
      requestId: randomUUID(),
      identityId: context.identityId,
      conversationId: context.conversationId,
      runId: context.runId,
      command,
    };
    const response = await instance.evaluate(
      ({ BrowserWindow }, args) => {
        const state = globalThis as typeof globalThis & {
          __mf570IntegratedPending?: Map<
            string,
            { sender: Electron.WebContents; finish: (response: unknown) => void }
          >;
        };
        const target = BrowserWindow.getAllWindows().find(
          (window) => !window.isDestroyed() && window.isVisible(),
        );
        if (!target) throw new Error('NO_REAL_ELECTRON_WINDOW');
        if (!state.__mf570IntegratedPending) throw new Error('QA_RELAY_NOT_INITIALIZED');
        return new Promise<unknown>((resolve) => {
          const timeout = setTimeout(() => {
            state.__mf570IntegratedPending?.delete(args.request.requestId);
            resolve({
              requestId: args.request.requestId,
              ok: false,
              error: { code: 'PANEL_TIMEOUT', message: 'No renderer response' },
            });
          }, 13_000);
          state.__mf570IntegratedPending!.set(args.request.requestId, {
            sender: target.webContents,
            finish: (value) => {
              clearTimeout(timeout);
              state.__mf570IntegratedPending!.delete(args.request.requestId);
              resolve(value);
            },
          });
          target.webContents.send(args.commandChannel, args.request);
        });
      },
      { commandChannel: AIChannels.LOCAL_AGENT_PANEL_COMMAND, request },
    );
    const panelResponse = response as NativePanelIpcResponse;
    observedCommands.push(command.action);
    if (panelResponse.ok) {
      const window = await instance.firstWindow();
      if (command.action === 'open') {
        await expect(window.getByTestId('goal-panel-form')).toBeVisible({ timeout: 4_000 });
        await expect(window.getByTestId('goal-name-input')).toBeDisabled();
      } else if (command.action === 'patch' && command.name) {
        await expect(window.getByTestId('goal-name-input')).toHaveValue(command.name);
        await expect(window.getByTestId('goal-name-input')).toBeDisabled();
        await expect(window.getByTestId('goal-description-input')).toHaveValue(
          command.description ?? '',
        );
      } else if (
        command.action === 'add_key_result' &&
        panelResponse.snapshot?.keyResults?.length === 2
      ) {
        await test.info().attach('goal-570-codex-native-controlled-form', {
          body: await window.screenshot(),
          contentType: 'image/png',
        });
      } else if (command.action === 'submit') {
        await expect(window.getByTestId('goal-panel-form')).toBeHidden({ timeout: 4_000 });
      }
    }
    return panelResponse;
  }

  async function releaseActualOwner(
    instance: ElectronApplication,
    conversationId: string,
    runId: string,
  ) {
    await instance.evaluate(
      ({ BrowserWindow }, args) => {
        const target = BrowserWindow.getAllWindows().find(
          (window) => !window.isDestroyed() && window.isVisible(),
        );
        target?.webContents.send(args.commandChannel, args.request);
      },
      {
        commandChannel: AIChannels.LOCAL_AGENT_PANEL_COMMAND,
        request: {
          requestId: randomUUID(),
          identityId: 'system',
          conversationId,
          runId,
          command: { action: 'release' as const },
        },
      },
    );
  }

  try {
    fs.mkdirSync(bundleRoot, { recursive: true });
    // Playwright's test loader uses CommonJS transforms for the Desktop
    // package. The shipped MCP registry is authored as ESM-only dependencies;
    // a test-only ESM bundle preserves those package import conditions.
    await bundleTestRuntime({
      entryPoints: [path.resolve(process.cwd(), 'test-support/native-goal-mcp-qa-runtime.ts')],
      bundle: true,
      packages: 'external',
      platform: 'node',
      format: 'esm',
      target: 'node24',
      outfile: runtimePath,
      logLevel: 'error',
    });
    type TestModule = typeof import('../test-support/native-goal-mcp-qa-runtime');
    // Preserve Node's native import() rather than the Playwright CJS transform.
    // Only a locally built, trusted file:// URL can reach this importer.
    const nativeImport = new Function('specifier', 'return import(specifier)') as (
      specifier: string,
    ) => Promise<TestModule>;
    const {
      LocalAgentRepository,
      createDesktopLocalAgentTools,
      createTimeContext,
      createPowerSyncSqliteFixture,
    } = await nativeImport(pathToFileURL(runtimePath).href);
    fixture = createPowerSyncSqliteFixture();
    const store = new LocalAgentRepository(fixture.db);

    app = await launch();
    let page = await app.firstWindow({ timeout: 45_000 });
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 45_000 });
    const provenance = await verifyInstalledNativeBinary(
      app,
      executable!,
      process.env.MEMOFLOW_QA_EXPECTED_EXE_SHA256!,
      process.env.MEMOFLOW_QA_EXPECTED_VERSION!,
    );
    expect((await readGoals(page)).pagination.total).toBe(0);
    await installTestOnlyResponseRelay(app);

    const panel: IDesktopNativePanelBridge = {
      executeCommand: (context, command) => dispatchToActualOwner(app!, context, command),
      releaseAllForRun: (conversationId, runId) => releaseActualOwner(app!, conversationId, runId),
    };
    bridge = createDesktopLocalAgentTools(
      fixture.db,
      store,
      () => true,
      { getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }) },
      undefined,
      panel,
    );
    const identityId = 'IdentityId_00000000-0000-4000-8000-000000000057';
    const connection = await store.createConnection(identityId, {
      driver: 'codex',
      name: 'Disposable installed Electron Goal MCP QA',
      executablePath: codexExecutable!,
      enabled: true,
      writeScopes: ['goals:write'],
    });
    const grant = await bridge.open({
      identityId,
      connectionId: connection.id,
      conversationId: 'qa-570-integrated',
      runId: 'native-codex-goal-write',
    });

    const script = path.resolve(
      import.meta.dirname,
      '../test-support/windows-codex-mcp-operator.cjs',
    );
    const { stdout } = await execFileAsync(process.execPath, [script], {
      timeout: 115_000,
      maxBuffer: 16_000,
      windowsHide: true,
      env: {
        ...isolatedEnv,
        MF570_INTEGRATED_GOAL: 'CONFIRM_REAL_RENDERER_NO_TURN',
        MF570_CODEX_WIN_EXE: codexExecutable!,
        MF570_MCP_URL: grant.url,
        MF570_MCP_TOKEN: grant.token,
      },
    });
    expect(stdout).toContain('DISCOVERED_GOAL_PANEL_TOOLS=8');
    expect(stdout).toContain('CODEX_GOAL_SNAPSHOT_CALL=true');
    expect(stdout).toContain('CODEX_GOAL_OPEN_CALL=true');
    expect(stdout).toContain('REAL_CODEX_TO_GOAL_OWNER_RPC=PASS');
    expect(stdout).toContain('NATIVE_MODEL_TURNS=0');
    expect(stdout).toContain('EPHEMERAL_CODEX_HOME_REMOVED=true');

    const proofLine = stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith('NATIVE_OWNER_PROOF_JSON='));
    expect(proofLine, 'Actual Codex tool calls must return the saved Goal ID').toBeTruthy();
    const proof = JSON.parse(proofLine!.slice('NATIVE_OWNER_PROOF_JSON='.length)) as {
      goalId: string;
      goalName: string;
      keyResultTitles: string[];
      modelTurns: number;
    };
    expect(proof.goalId).toBeTruthy();
    expect(proof.goalName).toBe(NAME);
    expect(proof.modelTurns).toBe(0);
    expect(observedCommands).toEqual([
      'snapshot',
      'open',
      'patch',
      'patch',
      'add_key_result',
      'add_key_result',
      'snapshot',
      'submit',
      'submit',
    ]);
    await expect(page.getByTestId('goal-panel-form')).toBeHidden();
    let goals = await readGoals(page);
    expect(goals.pagination.total).toBe(1);
    expect(goals.data.some((goal) => goal.id === proof.goalId && goal.name === NAME)).toBe(true);
    const keyResults = await readKeyResults(page, proof.goalId);
    expect(keyResults.total).toBe(2);
    expect(keyResults.data.map((entry) => entry.title).sort()).toEqual(
      [...proof.keyResultTitles].sort(),
    );

    grant.revoke();
    const rejected = await fetch(grant.url, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + grant.token,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'revoke-native-real-owner',
        method: 'tools/call',
        params: { name: 'goal_panel_snapshot', arguments: {} },
      }),
    });
    expect(rejected.status).toBe(401);
    await app.close();
    app = null;
    app = await launch();
    page = await app.firstWindow({ timeout: 45_000 });
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 45_000 });
    goals = await readGoals(page);
    expect(goals.pagination.total).toBe(1);
    expect(goals.data.some((goal) => goal.id === proof.goalId && goal.name === NAME)).toBe(true);
    expect((await readKeyResults(page, proof.goalId)).total).toBe(2);

    await test.info().attach('goal-570-real-codex-mcp-to-installed-owner', {
      body: Buffer.from(
        JSON.stringify({
          productSha256: provenance.executableSha256,
          productVersion: provenance.version,
          codexNativeAppServer: true,
          realMcpToolCalls: observedCommands,
          toolsDiscovered: 8,
          realRenderer: true,
          realOwnerSaved: true,
          ownerIdMatched: true,
          keyResultsSaved: 2,
          persistedAfterAppRestart: true,
          revokedGrantDenied: true,
          modelTurns: 0,
          ipcBridge: 'test-only relay, not shipped DesktopNativePanelBridge',
        }),
      ),
      contentType: 'application/json',
    });
  } finally {
    await bridge?.dispose();
    fixture?.close();
    if (app) await app.close();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(bundleRoot, { recursive: true, force: true });
  }
});
