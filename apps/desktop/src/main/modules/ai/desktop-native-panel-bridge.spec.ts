import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIChannels } from '@memoflow/contracts/electron';
import type { LocalToolContext } from '@memoflow/ai';

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  removeHandler: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: electronMock.handle,
    removeHandler: electronMock.removeHandler,
  },
}));

import { DesktopNativePanelBridge } from './desktop-native-panel-bridge';

describe('DesktopNativePanelBridge', () => {
  beforeEach(() => {
    electronMock.handle.mockReset();
    electronMock.removeHandler.mockReset();
  });

  function createMockContext(signal?: AbortSignal): LocalToolContext {
    return {
      identityId: 'id-1',
      connectionId: 'conn-1',
      conversationId: 'conv-1',
      runId: 'run-1',
      requestId: 'req-1',
      traceId: 'trace-1',
      source: 'test',
      startedAt: Date.now(),
      deadlineAt: Date.now() + 30000,
      signal: signal ?? new AbortController().signal,
      writeScopes: ['goals:write'],
      authorize: vi.fn(async () => {}),
      track: vi.fn(async (work) => work()),
    };
  }

  it('sends command to window webContents and resolves when response arrives', async () => {
    let capturedRequest: any = null;

    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        on: vi.fn(),
        removeListener: vi.fn(),
        send: vi.fn((channel, req) => {
          if (channel === AIChannels.LOCAL_AGENT_PANEL_COMMAND) {
            capturedRequest = req;
            const call = electronMock.handle.mock.calls.find(
              ([c]) => c === AIChannels.LOCAL_AGENT_PANEL_RESPONSE,
            );
            if (call) {
              const handler = call[1];
              setTimeout(() => {
                handler(
                  { sender: mockWindow.webContents },
                  {
                    requestId: req.requestId,
                    ok: true,
                    snapshot: {
                      panelSurface: 'business',
                      activeModule: 'goal',
                      activeTabRoute: '/goals',
                      formOpen: true,
                      mode: 'create',
                      goalId: null,
                      revision: 1,
                      dirty: false,
                      busy: false,
                      error: null,
                      isControlled: true,
                      controlledByMe: true,
                      allowedActions: ['patch', 'submit', 'release'],
                    },
                  },
                );
              }, 10);
            }
          }
        }),
      },
    };

    const bridge = new DesktopNativePanelBridge({
      getMainWindow: () => mockWindow as any,
      isActive: () => true,
    });

    const context = createMockContext();
    const result = await bridge.executeCommand(context, { action: 'snapshot' });

    expect(result.ok).toBe(true);
    expect(result.snapshot?.formOpen).toBe(true);
    expect(capturedRequest.command.action).toBe('snapshot');
    expect(capturedRequest.runId).toBe('run-1');
  });

  it('rebinds the single response channel on Profile switch, rejects stale requests and sender spoofing', async () => {
    const handlers = new Map<string, (event: any, payload: any) => any>();
    electronMock.handle.mockImplementation((channel, handler) => {
      if (handlers.has(channel)) throw new Error('Duplicate IPC handler');
      handlers.set(channel, handler);
    });
    electronMock.removeHandler.mockImplementation((channel) => handlers.delete(channel));

    const firstWindow = {
      isDestroyed: () => false,
      webContents: { on: vi.fn(), removeListener: vi.fn(), send: vi.fn() },
    };
    const first = new DesktopNativePanelBridge({
      getMainWindow: () => firstWindow as any,
      isActive: () => true,
      commandTimeoutMs: 1000,
    });
    const firstPending = first.executeCommand(createMockContext(), { action: 'snapshot' });
    const secondWindow = {
      isDestroyed: () => false,
      webContents: { on: vi.fn(), removeListener: vi.fn(), send: vi.fn() },
    };
    const second = new DesktopNativePanelBridge({
      getMainWindow: () => secondWindow as any,
      isActive: () => true,
      commandTimeoutMs: 1000,
    });
    await expect(firstPending).rejects.toThrow('disposed');
    await expect(first.executeCommand(createMockContext(), { action: 'snapshot' })).rejects.toThrow(
      'inactive',
    );
    const secondPending = second.executeCommand(createMockContext(), { action: 'snapshot' });
    const request = secondWindow.webContents.send.mock.calls[0][1];
    const handler = handlers.get(AIChannels.LOCAL_AGENT_PANEL_RESPONSE)!;
    expect(
      handler({ sender: firstWindow.webContents }, { requestId: request.requestId, ok: true }),
    ).toEqual({ ok: false });
    expect(
      handler({ sender: secondWindow.webContents }, { requestId: request.requestId, ok: true }),
    ).toEqual({ ok: true });
    await expect(secondPending).resolves.toMatchObject({ ok: true, requestId: request.requestId });
    second.dispose();
    expect(handlers.has(AIChannels.LOCAL_AGENT_PANEL_RESPONSE)).toBe(false);
  });

  it('rejects when active check fails', async () => {
    const bridge = new DesktopNativePanelBridge({
      getMainWindow: () => ({}) as any,
      isActive: () => false,
    });

    const context = createMockContext();
    await expect(bridge.executeCommand(context, { action: 'snapshot' })).rejects.toThrow(
      'Active profile is locked, switched, or inactive',
    );
  });

  it('rejects when window is not available', async () => {
    const bridge = new DesktopNativePanelBridge({
      getMainWindow: () => null,
      isActive: () => true,
    });

    const context = createMockContext();
    await expect(bridge.executeCommand(context, { action: 'snapshot' })).rejects.toThrow(
      'No active window available',
    );
  });

  it('rejects an already-aborted run before sending any panel command', async () => {
    const controller = new AbortController();
    controller.abort();
    const webContents = { on: vi.fn(), removeListener: vi.fn(), send: vi.fn() };
    const bridge = new DesktopNativePanelBridge({
      getMainWindow: () => ({ isDestroyed: () => false, webContents }) as any,
      isActive: () => true,
      commandTimeoutMs: 20,
    });
    try {
      await expect(
        bridge.executeCommand(createMockContext(controller.signal), { action: 'open' }),
      ).rejects.toThrow('aborted');
      expect(webContents.send).not.toHaveBeenCalled();
    } finally {
      bridge.dispose();
    }
  });

  it('removes a settled request abort listener instead of retaining stale callbacks', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const webContents = { on: vi.fn(), removeListener: vi.fn(), send: vi.fn() };
    const bridge = new DesktopNativePanelBridge({
      getMainWindow: () => ({ isDestroyed: () => false, webContents }) as any,
      isActive: () => true,
    });
    try {
      const pending = bridge.executeCommand(createMockContext(controller.signal), {
        action: 'snapshot',
      });
      const request = webContents.send.mock.calls[0][1];
      const handler = electronMock.handle.mock.calls.at(-1)![1];
      expect(handler({ sender: webContents }, { requestId: request.requestId, ok: true })).toEqual({
        ok: true,
      });
      await expect(pending).resolves.toMatchObject({ ok: true });
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    } finally {
      bridge.dispose();
    }
  });

  it.each(['destroyed', 'render-process-gone', 'did-start-navigation'])(
    'rejects pending commands on %s and removes window event listeners',
    async (event) => {
      const webContents = Object.assign(new EventEmitter(), { send: vi.fn() });
      const window = { isDestroyed: () => false, webContents };
      const bridge = new DesktopNativePanelBridge({
        getMainWindow: () => window as any,
        isActive: () => true,
        commandTimeoutMs: 25,
      });
      try {
        const pending = bridge.executeCommand(createMockContext(), { action: 'open' });
        webContents.emit(event, { isMainFrame: true, isSameDocument: false });
        await expect(pending).rejects.toThrow(/renderer|window/i);
        expect(webContents.listenerCount(event)).toBe(0);
      } finally {
        bridge.dispose();
      }
    },
  );

  it('keeps a panel request alive for in-page navigation and iframe navigation', async () => {
    const webContents = Object.assign(new EventEmitter(), { send: vi.fn() });
    const window = { isDestroyed: () => false, webContents };
    const bridge = new DesktopNativePanelBridge({
      getMainWindow: () => window as any,
      isActive: () => true,
    });
    try {
      const pending = bridge.executeCommand(createMockContext(), { action: 'open' });
      const request = webContents.send.mock.calls[0][1];
      webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
      webContents.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false });
      electronMock.handle.mock.calls.at(-1)![1](
        { sender: webContents },
        { requestId: request.requestId, ok: true },
      );
      await expect(pending).resolves.toMatchObject({ ok: true });
      expect(webContents.eventNames()).toEqual([]);
    } finally {
      bridge.dispose();
    }
  });

  it('rejects when aborted', async () => {
    const controller = new AbortController();
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        on: vi.fn(),
        removeListener: vi.fn(),
        send: vi.fn(),
      },
    };

    const bridge = new DesktopNativePanelBridge({
      getMainWindow: () => mockWindow as any,
      isActive: () => true,
      commandTimeoutMs: 5000,
    });

    const context = createMockContext(controller.signal);
    const promise = bridge.executeCommand(context, { action: 'snapshot' });
    controller.abort();

    await expect(promise).rejects.toThrow('Panel command was aborted');
  });
});
