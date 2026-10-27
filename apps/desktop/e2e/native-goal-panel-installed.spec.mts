import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { AIChannels, GoalChannels } from '@memoflow/desktop-contracts';
import type { GoalPanelCommand, NativePanelIpcResponse } from '@memoflow/ai-contracts';
import { createIsolatedNativeAgentEnvironment } from './packaged-runtime/isolated-native-env';
import { verifyInstalledNativeBinary } from './support/installed-native-provenance';

/**
 * #570 real installed Windows Electron renderer -> actual Goal Vue form ->
 * actual local Goal owner store. The agent-side command is injected by a
 * test-only IPC adapter, NOT by a live Codex model or an MCP run. The separate
 * Windows operator spec proves Codex -> real Desktop MCP tool dispatch.
 *
 * Never run against an existing user's MemoFlow Profile.
 */
test('installed Windows Goal panel accepts agent commands and persists the real local Goal owner', async () => {
  test.skip(process.platform !== 'win32', 'Windows packaged Electron/Goal owner acceptance only');
  test.setTimeout(115_000);

  const executable = process.env.MEMOFLOW_PACKAGED_EXECUTABLE;
  expect(
    executable,
    'An independently verified installed NSIS executable is required',
  ).toBeTruthy();
  expect(fs.existsSync(executable!), 'Installed executable must exist').toBe(true);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-570-native-goal-'));
  const sanitized = createIsolatedNativeAgentEnvironment(root);
  const userData = path.join(root, 'profile');
  let app: ElectronApplication | null = null;

  async function launch(): Promise<ElectronApplication> {
    return electron.launch({
      executablePath: executable!,
      args: ['--disable-gpu', '--disable-dev-shm-usage'],
      cwd: process.cwd(),
      env: {
        ...sanitized,
        MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: userData,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });
  }

  const responseChannel = AIChannels.LOCAL_AGENT_PANEL_RESPONSE;
  const commandChannel = AIChannels.LOCAL_AGENT_PANEL_COMMAND;

  async function installTestOnlyPanelResponseRecorder(
    instance: ElectronApplication,
  ): Promise<void> {
    await instance.evaluate(({ ipcMain, BrowserWindow }, channel) => {
      type TestResponse = { requestId: string; ok: boolean; [key: string]: unknown };
      const qa = globalThis as typeof globalThis & {
        __mf570WindowReplyMap?: Map<string, TestResponse>;
      };
      qa.__mf570WindowReplyMap = new Map();
      // This replaces the native run's response handler ONLY inside the disposable
      // test process; there is no MCP grant/user session involved in this test.
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, (event, incoming: unknown) => {
        const activeWindow = BrowserWindow.fromWebContents(event.sender);
        if (!activeWindow || !activeWindow.isVisible()) return { ok: false };
        const reply = incoming as TestResponse;
        if (typeof reply?.requestId !== 'string' || typeof reply.ok !== 'boolean') {
          return { ok: false };
        }
        qa.__mf570WindowReplyMap?.set(reply.requestId, reply);
        return { ok: true };
      });
    }, responseChannel);
  }

  async function sendToRealRenderer(
    instance: ElectronApplication,
    page: Page,
    command: GoalPanelCommand,
    conversationId: string,
    runId: string,
  ): Promise<NativePanelIpcResponse> {
    const requestId = randomUUID();
    const currentUrl = page.url();
    const request = {
      requestId,
      identityId: 'operator-qa-local-only',
      conversationId,
      runId,
      command,
    };
    const sent = await instance.evaluate(
      ({ BrowserWindow }, args) => {
        const target = BrowserWindow.getAllWindows().find(
          (candidate) =>
            !candidate.isDestroyed() && candidate.webContents.getURL() === args.currentUrl,
        );
        if (!target) return false;
        target.webContents.send(args.commandChannel, args.request);
        return true;
      },
      { commandChannel, request, currentUrl },
    );
    expect(sent, 'The installed Electron main window must receive the agent command').toBe(true);
    let output: NativePanelIpcResponse | null = null;
    await expect
      .poll(
        async () =>
          instance.evaluate((_, id) => {
            const replies = (
              globalThis as typeof globalThis & {
                __mf570WindowReplyMap?: Map<string, NativePanelIpcResponse>;
              }
            ).__mf570WindowReplyMap;
            return replies?.get(id) ?? null;
          }, requestId),
        {
          timeout: 19_000,
          intervals: [75, 150, 350],
          message: 'Real renderer must acknowledge the Goal panel action over Electron IPC',
        },
      )
      .not.toBeNull();
    output = await instance.evaluate(
      (_, id) =>
        (
          globalThis as typeof globalThis & {
            __mf570WindowReplyMap?: Map<string, NativePanelIpcResponse>;
          }
        ).__mf570WindowReplyMap?.get(id) ?? null,
      requestId,
    );
    expect(output).not.toBeNull();
    return output!;
  }

  async function readLocalGoals(page: Page) {
    const response = await page.evaluate(
      (channel) =>
        (
          window as typeof window & {
            electronAPI: {
              invoke(
                channel: string,
                request: object,
              ): Promise<{
                ok: boolean;
                data?: { pagination: { total: number }; data: Array<{ id: string; name: string }> };
              }>;
            };
          }
        ).electronAPI.invoke(channel, {}),
      GoalChannels.LIST,
    );
    expect(response.ok, 'Real Goal owner query should succeed').toBe(true);
    expect(response.data).toBeDefined();
    return response.data!;
  }

  async function readLocalKeyResults(page: Page, goalId: string) {
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
    expect(result.ok, 'Native owner Key Result read must succeed').toBe(true);
    return result.data!;
  }

  try {
    app = await launch();
    let page = await app.firstWindow({ timeout: 45_000 });
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 45_000 });
    const provenance = await verifyInstalledNativeBinary(
      app,
      executable!,
      process.env.MEMOFLOW_QA_EXPECTED_EXE_SHA256!,
      process.env.MEMOFLOW_QA_EXPECTED_VERSION!,
    );
    await test.info().attach('goal-570-installed-provenance', {
      body: Buffer.from(
        JSON.stringify({
          packaged: provenance.packaged,
          version: provenance.version,
          executableSha256: provenance.executableSha256,
          modelTurns: 0,
          producer: 'test-only Electron IPC command adapter',
        }),
      ),
      contentType: 'application/json',
    });
    expect((await readLocalGoals(page)).pagination.total).toBe(0);
    await installTestOnlyPanelResponseRecorder(app);

    const conversationId = 'qa-570-native-panel';
    const runId = 'qa-570-save';
    const perform = (action: GoalPanelCommand, run = runId) =>
      sendToRealRenderer(app!, page, action, conversationId, run);

    const first = await perform({ action: 'snapshot' });
    expect(first.ok).toBe(true);
    expect(first.snapshot?.formOpen).toBe(false);

    const opened = await perform({ action: 'open', mode: 'create' });
    expect(opened.ok, JSON.stringify(opened.error)).toBe(true);
    expect(opened.snapshot).toMatchObject({
      formOpen: true,
      mode: 'create',
      isControlled: true,
      controlledByMe: true,
    });
    await expect(page.getByTestId('goal-panel-form')).toBeVisible();
    await expect(page.getByTestId('goal-name-input')).toBeDisabled();

    const title = 'QA 570 Windows Goal owner acceptance';
    const utcDay = (daysFromNow: number) =>
      new Date(Date.now() + daysFromNow * 86400_000).toISOString().slice(0, 10);
    const start = { kind: 'day' as const, date: utcDay(3) };
    const target = { kind: 'day' as const, date: utcDay(45) };
    const patched = await perform({
      action: 'patch',
      expectedRevision: opened.snapshot!.revision,
      name: title,
      summary: 'Native panel E2E owner write, isolated profile',
      description: 'This Goal was created by test-scoped IPC commands in a temporary profile.',
      start,
      target,
    });
    expect(patched.ok, JSON.stringify(patched.error)).toBe(true);
    expect(patched.snapshot?.fields).toMatchObject({ name: title, start, target });
    await expect(page.getByTestId('goal-name-input')).toHaveValue(title);
    await expect(page.getByTestId('goal-description-input')).toHaveValue(
      'This Goal was created by test-scoped IPC commands in a temporary profile.',
    );
    await expect(page.getByTestId('goal-name-input')).toBeDisabled();

    const stale = await perform({
      action: 'patch',
      expectedRevision: opened.snapshot!.revision,
      name: 'Overwritten by stale agent',
    });
    expect(stale.ok).toBe(false);
    expect(stale.error?.code).toBe('REVISION_CONFLICT');
    await expect(page.getByTestId('goal-name-input')).toHaveValue(title);

    let revision = patched.snapshot!.revision;
    for (const keyResultTitle of ['Read 12 technical papers', 'Complete 24 coding exercises']) {
      const result = await perform({
        action: 'add_key_result',
        expectedRevision: revision,
        keyResult: {
          title: keyResultTitle,
          calculationMethod: 'Sum',
          initialValue: 0,
          targetValue: 12,
          weight: 3,
        },
      });
      expect(result.ok, JSON.stringify(result.error)).toBe(true);
      revision = result.snapshot!.revision!;
    }
    const complete = await perform({ action: 'snapshot' });
    expect(complete.snapshot?.keyResults?.map((item) => item.title)).toEqual([
      'Read 12 technical papers',
      'Complete 24 coding exercises',
    ]);
    await test.info().attach('goal-570-live-controlled-form', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    const saved = await perform({ action: 'submit', expectedRevision: revision });
    expect(saved.ok, JSON.stringify(saved.error)).toBe(true);
    expect(saved.submitResult).toMatchObject({ success: true, name: title });
    const goalId = saved.submitResult!.goalId;
    expect(goalId).toBeTruthy();
    await expect(page.getByTestId('goal-panel-form')).toBeHidden();
    let owner = await readLocalGoals(page);
    expect(owner.pagination.total).toBe(1);
    expect(owner.data.some((record) => record.id === goalId && record.name === title)).toBe(true);
    const ownerKeyResults = await readLocalKeyResults(page, goalId);
    expect(ownerKeyResults.total).toBe(2);
    expect(ownerKeyResults.data.map((result) => result.title).sort()).toEqual([
      'Complete 24 coding exercises',
      'Read 12 technical papers',
    ]);

    // A second submit using the same native run cannot duplicate the owner Goal.
    const replay = await perform({ action: 'submit' });
    expect(replay.ok).toBe(false);
    owner = await readLocalGoals(page);
    expect(owner.pagination.total).toBe(1);

    const cancelRun = 'qa-570-cancel';
    const reopened = await perform({ action: 'open', mode: 'create' }, cancelRun);
    expect(reopened.ok, JSON.stringify(reopened.error)).toBe(true);
    const draft = await perform(
      {
        action: 'patch',
        expectedRevision: reopened.snapshot?.revision,
        name: 'QA 570 retained draft after cancellation',
      },
      cancelRun,
    );
    expect(draft.ok).toBe(true);
    const released = await perform({ action: 'release' }, cancelRun);
    expect(released.ok).toBe(true);
    await expect(page.getByTestId('goal-name-input')).toHaveValue(
      'QA 570 retained draft after cancellation',
    );
    await expect(page.getByTestId('goal-name-input')).toBeEnabled();
    const late = await perform(
      { action: 'patch', name: 'Late cancelled operation must be denied' },
      cancelRun,
    );
    expect(late.ok).toBe(false);
    expect(late.error?.code).toBe('PANEL_NOT_CONTROLLED');
    await expect(page.getByTestId('goal-name-input')).toHaveValue(
      'QA 570 retained draft after cancellation',
    );
    expect((await readLocalGoals(page)).pagination.total).toBe(1);

    // Check real owner persistence across a fresh installed-process startup.
    await app.close();
    app = null;
    app = await launch();
    page = await app.firstWindow({ timeout: 45_000 });
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 45_000 });
    owner = await readLocalGoals(page);
    expect(owner.pagination.total).toBe(1);
    expect(owner.data.some((record) => record.id === goalId && record.name === title)).toBe(true);
    expect((await readLocalKeyResults(page, goalId)).total).toBe(2);
    await test.info().attach('goal-570-owner-result', {
      body: Buffer.from(
        JSON.stringify({ ownerSaved: true, ownerReopen: true, goalIdPresent: true, count: 1 }),
      ),
      contentType: 'application/json',
    });
  } finally {
    if (app) await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
