import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { AIChannels, AIStreamChannels } from '@memoflow/contracts/electron';
import { createIsolatedNativeAgentEnvironment } from './packaged-runtime/isolated-native-env';
import { verifyInstalledNativeBinary } from './support/installed-native-provenance';

type WorkspaceQaEnvelope = {
  streamId: string;
  event: {
    type: string;
    cursor: string;
    eventId?: string;
    resourceVersion?: number;
    reason?: string;
    data?: { conversation?: { name: string } | null; runId?: string; status?: string };
  };
};

type WorkspaceQaWindow = {
  electronAPI: {
    invoke(
      channel: string,
      ...args: unknown[]
    ): Promise<{
      ok: boolean;
      data?: unknown;
      error?: { code: string };
    }>;
    on(channel: string, callback: (payload: WorkspaceQaEnvelope) => void): void;
  };
  __qaWorkspaceEvents: WorkspaceQaEnvelope[];
};

test('real Windows Electron Workspace IPC authenticates start, ack, stop, cursor recovery and Conversation events', async () => {
  test.skip(process.platform !== 'win32', 'Real Windows Electron Workspace IPC acceptance');
  test.setTimeout(90_000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-workspace-ipc-qa-'));
  const sanitized = createIsolatedNativeAgentEnvironment(root);
  const installedExecutable = process.env.MEMOFLOW_PACKAGED_EXECUTABLE;
  let app: Awaited<ReturnType<typeof electron.launch>> | null = null;
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
        ...sanitized,
        NODE_ENV: 'test',
        MEMOFLOW_DESKTOP_USER_DATA_PATH: path.join(root, 'user-data'),
        MEMOFLOW_DESKTOP_USER_FILES_PATH: path.join(root, 'user-files'),
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
    const probeId = await app.evaluate(async ({ BrowserWindow }, preloadPath) => {
      const win = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
      });
      await win.loadURL('data:text/html;charset=utf-8,<html><body>Workspace IPC QA</body></html>');
      return win.id;
    }, preload);
    expect(probeId).toBeGreaterThan(0);
    // Packaged Desktop may own auxiliary windows; require the QA inspector
    // itself rather than assuming the total BrowserWindow count is exactly 2.
    await expect
      .poll(
        async () => (await app!.windows()).some((win) => win.url().startsWith('data:text/html')),
        {
          timeout: 12000,
        },
      )
      .toBe(true);
    const inspector = (await app.windows()).find((p) => p.url().startsWith('data:text/html'));
    expect(inspector, 'test-only Window must exist').toBeDefined();
    const probe = inspector!;
    const bridgeAvailable = await probe.evaluate(() =>
      Boolean((window as unknown as WorkspaceQaWindow).electronAPI?.invoke),
    );
    expect(bridgeAvailable, 'preload bridge must work in test-only webContents').toBe(true);
    await probe.evaluate((channel) => {
      (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents = [];
      (window as unknown as WorkspaceQaWindow).electronAPI.on(
        channel,
        (payload: WorkspaceQaEnvelope) =>
          (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.push(payload),
      );
    }, AIStreamChannels.RUNTIME_WORKSPACE_EVENT);
    const streamId = 'qa-ws-1';
    const start = await probe.evaluate(
      ({ channel, streamId }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, { streamId }),
      { channel: AIChannels.RUNTIME_WORKSPACE_START, streamId },
    );
    expect(start).toMatchObject({ ok: true, data: { accepted: true } });
    await probe.waitForFunction(
      (id) =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.some(
          (e: WorkspaceQaEnvelope) => e.streamId === id && e.event?.type === 'stream.ready',
        ),
      streamId,
      { timeout: 12000 },
    );
    const cursor = await probe.evaluate(
      (id) =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.find(
          (e: WorkspaceQaEnvelope) => e.streamId === id && e.event?.type === 'stream.ready',
        ).event.cursor,
      streamId,
    );
    expect(cursor.length).toBeGreaterThan(10);
    const badAck = await probe.evaluate(
      ({ channel, streamId }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
          streamId,
          cursor: 'wrong',
        }),
      { channel: AIChannels.RUNTIME_WORKSPACE_ACK, streamId },
    );
    expect(badAck).toMatchObject({ ok: true, data: { accepted: false } });
    const ack = await probe.evaluate(
      ({ channel, streamId, cursor }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, { streamId, cursor }),
      { channel: AIChannels.RUNTIME_WORKSPACE_ACK, streamId, cursor },
    );
    expect(ack).toMatchObject({ ok: true, data: { accepted: true } });
    const duplicate = await probe.evaluate(
      ({ channel }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
          streamId: 'qa-ws-duplicate',
        }),
      { channel: AIChannels.RUNTIME_WORKSPACE_START },
    );
    expect(duplicate).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    const create = await probe.evaluate(
      ({ channel }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
          name: 'QA454 Workspace event smoke',
        }),
      { channel: AIChannels.CONVERSATION_CREATE },
    );
    expect(create).toMatchObject({ ok: true });
    const createdConversation = create.data as
      { id?: string; conversation?: { id?: string } } | undefined;
    const goalConversationId = createdConversation?.id ?? createdConversation?.conversation?.id;
    expect(goalConversationId, 'native owner-created Conversation id must exist').toBeTruthy();
    await probe.waitForFunction(
      (id) =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.some(
          (e: WorkspaceQaEnvelope) => e.streamId === id && e.event?.type === 'conversation.updated',
        ),
      streamId,
      { timeout: 12000 },
    );
    const changed = await probe.evaluate(
      (id) =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.find(
          (e: WorkspaceQaEnvelope) => e.streamId === id && e.event?.type === 'conversation.updated',
        ),
      streamId,
    );
    expect(changed.event.resourceVersion).toBeGreaterThan(0);
    expect(changed.event.data.conversation?.name).toBe('QA454 Workspace event smoke');
    const changeAck = await probe.evaluate(
      ({ channel, streamId, cursor }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, { streamId, cursor }),
      { channel: AIChannels.RUNTIME_WORKSPACE_ACK, streamId, cursor: changed.event.cursor },
    );
    expect(changeAck).toMatchObject({ ok: true, data: { accepted: true } });
    const stop = await probe.evaluate(
      ({ channel, streamId }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, { streamId }),
      { channel: AIChannels.RUNTIME_WORKSPACE_STOP, streamId },
    );
    expect(stop).toMatchObject({ ok: true, data: { accepted: true } });
    // Wait for stream ownership release (asynchronous), then test owner-bound invalid resume cursor.
    await expect
      .poll(
        async () => {
          const r = await probe.evaluate(
            ({ channel }) =>
              (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
                streamId: 'qa-ws-2',
                cursor: 'invalid-cursor',
              }),
            { channel: AIChannels.RUNTIME_WORKSPACE_START },
          );
          return r.ok ? true : false;
        },
        { timeout: 12000, intervals: [200, 300, 500] },
      )
      .toBe(true);
    await probe.waitForFunction(
      () =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.some(
          (e: WorkspaceQaEnvelope) =>
            e.streamId === 'qa-ws-2' && e.event?.type === 'stream.reset_required',
        ),
      undefined,
      { timeout: 12000 },
    );
    const reset = await probe.evaluate(
      () =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.find(
          (e: WorkspaceQaEnvelope) =>
            e.streamId === 'qa-ws-2' && e.event?.type === 'stream.reset_required',
        ).event,
    );
    expect(reset.reason).toBe('invalid');
    const resetAck = await probe.evaluate(
      ({ channel, cursor }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
          streamId: 'qa-ws-2',
          cursor,
        }),
      { channel: AIChannels.RUNTIME_WORKSPACE_ACK, cursor: reset.cursor },
    );
    expect(resetAck).toMatchObject({ ok: true, data: { accepted: true } });
    // The first cursor predates the conversation mutation. A new stream must replay it.
    await expect
      .poll(
        async () => {
          const result = await probe.evaluate(
            ({ channel, cursor }) =>
              (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
                streamId: 'qa-ws-replay',
                cursor,
              }),
            { channel: AIChannels.RUNTIME_WORKSPACE_START, cursor },
          );
          return result.ok === true;
        },
        { timeout: 12000, intervals: [200, 300, 500] },
      )
      .toBe(true);
    await probe.waitForFunction(
      () =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.some(
          (e: WorkspaceQaEnvelope) =>
            e.streamId === 'qa-ws-replay' && e.event?.type === 'stream.ready',
        ),
      undefined,
      { timeout: 12000 },
    );
    const replayReady = await probe.evaluate(
      () =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.find(
          (e: WorkspaceQaEnvelope) =>
            e.streamId === 'qa-ws-replay' && e.event?.type === 'stream.ready',
        ).event.cursor,
    );
    const replayReadyAck = await probe.evaluate(
      ({ channel, cursor }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
          streamId: 'qa-ws-replay',
          cursor,
        }),
      { channel: AIChannels.RUNTIME_WORKSPACE_ACK, cursor: replayReady },
    );
    expect(replayReadyAck).toMatchObject({ ok: true, data: { accepted: true } });
    await probe.waitForFunction(
      () =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.some(
          (e: WorkspaceQaEnvelope) =>
            e.streamId === 'qa-ws-replay' && e.event?.type === 'conversation.updated',
        ),
      undefined,
      { timeout: 12000 },
    );
    const replayed = await probe.evaluate(
      () =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.find(
          (e: WorkspaceQaEnvelope) =>
            e.streamId === 'qa-ws-replay' && e.event?.type === 'conversation.updated',
        ).event,
    );
    expect(replayed.eventId).toBe(changed.event.eventId);
    expect(replayed.data.conversation?.name).toBe('QA454 Workspace event smoke');
    const replayAck = await probe.evaluate(
      ({ channel, cursor }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
          streamId: 'qa-ws-replay',
          cursor,
        }),
      { channel: AIChannels.RUNTIME_WORKSPACE_ACK, cursor: replayed.cursor },
    );
    expect(replayAck).toMatchObject({ ok: true, data: { accepted: true } });
    await probe.evaluate(
      ({ channel }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
          streamId: 'qa-ws-replay',
        }),
      { channel: AIChannels.RUNTIME_WORKSPACE_STOP },
    );
    // Goal's real Mastra snapshot owner emits workflow.updated, not a synthetic
    // stream fixture. ACK each preceding event first: Workspace delivery is
    // intentionally backpressured until the client has accepted its cursor.
    await expect
      .poll(
        async () => {
          const result = await probe.evaluate(
            ({ channel, cursor }) =>
              (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
                streamId: 'qa-goal',
                cursor,
              }),
            { channel: AIChannels.RUNTIME_WORKSPACE_START, cursor: replayed.cursor },
          );
          return result.ok && (result.data as { accepted?: boolean })?.accepted === true;
        },
        { timeout: 12000, intervals: [200, 300, 500] },
      )
      .toBe(true);
    await probe.waitForFunction(
      () =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.some(
          (e: WorkspaceQaEnvelope) => e.streamId === 'qa-goal' && e.event?.type === 'stream.ready',
        ),
      undefined,
      { timeout: 12000 },
    );
    const goalReady = await probe.evaluate(
      () =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.find(
          (e: WorkspaceQaEnvelope) => e.streamId === 'qa-goal' && e.event?.type === 'stream.ready',
        ).event.cursor,
    );
    const goalReadyAck = await probe.evaluate(
      ({ channel, cursor }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
          streamId: 'qa-goal',
          cursor,
        }),
      { channel: AIChannels.RUNTIME_WORKSPACE_ACK, cursor: goalReady },
    );
    expect(goalReadyAck).toMatchObject({ ok: true, data: { accepted: true } });

    // The test deliberately uses an empty, isolated Native Agent Home and no
    // provider secrets. Only the owner's durable workflow start is asserted;
    // subsequent AI planning/inference is not a prerequisite for this event.
    const goalStart = await probe.evaluate(
      ({ channel, conversationId }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
          kind: 'goal.create',
          conversationId,
          input: { idea: 'QA Workspace Goal event without a signed-in Native Provider' },
          locale: 'zh-CN',
        }),
      { channel: AIChannels.RUNTIME_WORKFLOW_START, conversationId: goalConversationId! },
    );
    expect(goalStart).toMatchObject({ ok: true });
    const goalRunId = (goalStart.data as { runId?: string } | undefined)?.runId;
    expect(goalRunId).toBeTruthy();
    await probe.waitForFunction(
      () =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.some(
          (e: WorkspaceQaEnvelope) =>
            e.streamId === 'qa-goal' && e.event?.type === 'workflow.updated',
        ),
      undefined,
      { timeout: 15000 },
    );
    const goalEvent = await probe.evaluate(
      () =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.find(
          (e: WorkspaceQaEnvelope) =>
            e.streamId === 'qa-goal' && e.event?.type === 'workflow.updated',
        ).event,
    );
    expect(goalEvent.type).toBe('workflow.updated');
    expect(goalEvent.resourceVersion).toBeGreaterThan(0);
    expect(goalEvent.data?.runId).toBe(goalRunId);
    expect(goalEvent.data?.status).toBe('running');
    const goalChangeAck = await probe.evaluate(
      ({ channel, cursor }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
          streamId: 'qa-goal',
          cursor,
        }),
      { channel: AIChannels.RUNTIME_WORKSPACE_ACK, cursor: goalEvent.cursor },
    );
    expect(goalChangeAck).toMatchObject({ ok: true, data: { accepted: true } });
    const goalStop = await probe.evaluate(
      ({ channel }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
          streamId: 'qa-goal',
        }),
      { channel: AIChannels.RUNTIME_WORKSPACE_STOP },
    );
    expect(goalStop).toMatchObject({ ok: true, data: { accepted: true } });

    // The same Electron instance switches to a new isolated Guest, without copying any app data.
    await main.getByTestId('shell-account-menu').click();
    await main.getByTestId('shell-switch-account').click();
    await main.getByTestId('shell-manage-profiles').click();
    await expect(main.getByTestId('manage-accounts-dialog')).toBeVisible({ timeout: 12000 });
    await main
      .getByTestId('desktop-profile-create')
      .locator('input')
      .fill('QA Workspace other owner');
    const secondWindowPromise = app.waitForEvent('window', {
      predicate: async (page) => {
        try {
          await page.getByTestId('app-shell').waitFor({ state: 'visible', timeout: 18000 });
          return true;
        } catch {
          return false;
        }
      },
    });
    await main.getByTestId('desktop-profile-create').getByRole('button').click();
    const secondMain = await secondWindowPromise;
    await expect(secondMain.getByTestId('app-shell')).toBeVisible({ timeout: 18000 });
    // Old cursor belongs to Guest A. Guest B must fail closed with reset_required invalid.
    await expect
      .poll(
        async () => {
          const result = await probe.evaluate(
            ({ channel, cursor }) =>
              (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
                streamId: 'qa-ws-other-owner',
                cursor,
              }),
            { channel: AIChannels.RUNTIME_WORKSPACE_START, cursor: changed.event.cursor },
          );
          return result.ok === true;
        },
        { timeout: 12000, intervals: [200, 300, 500] },
      )
      .toBe(true);
    await probe.waitForFunction(
      () =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.some(
          (e: WorkspaceQaEnvelope) =>
            e.streamId === 'qa-ws-other-owner' && e.event?.type === 'stream.reset_required',
        ),
      undefined,
      { timeout: 12000 },
    );
    const foreignReset = await probe.evaluate(
      () =>
        (window as unknown as WorkspaceQaWindow).__qaWorkspaceEvents.find(
          (e: WorkspaceQaEnvelope) =>
            e.streamId === 'qa-ws-other-owner' && e.event?.type === 'stream.reset_required',
        ).event,
    );
    expect(foreignReset.reason).toBe('invalid');
    const otherList = await probe.evaluate(
      ({ channel }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
          page: 1,
          pageSize: 20,
        }),
      { channel: AIChannels.CONVERSATION_LIST },
    );
    expect(JSON.stringify(otherList)).not.toContain('QA454 Workspace event smoke');
    await probe.evaluate(
      ({ channel, cursor }) =>
        (window as unknown as WorkspaceQaWindow).electronAPI.invoke(channel, {
          streamId: 'qa-ws-other-owner',
          cursor,
        }),
      { channel: AIChannels.RUNTIME_WORKSPACE_ACK, cursor: foreignReset.cursor },
    );
    console.log(
      'WORKSPACE_IPC_REAL_WINDOWS_QA=' +
        JSON.stringify({
          ready: true,
          badAckRejected: true,
          validAck: true,
          duplicateRejected: true,
          conversationEvent: true,
          conversationEventVersion: changed.event.resourceVersion,
          cancelled: true,
          invalidCursorReset: true,
          cursorReplay: true,
          nativeGoalWorkflowEvent: true,
          profileIsolation: true,
          foreignCursorRejected: true,
        }),
    );
  } finally {
    if (app) await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
