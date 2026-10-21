import { randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { AIChannels } from '@memoflow/contracts/electron';
import {
  NativePanelIpcRequestSchema,
  NativePanelIpcResponseSchema,
  type GoalPanelCommand,
  type NativePanelIpcRequest,
  type NativePanelIpcResponse,
} from '@memoflow/contracts/ai';
import type { LocalToolContext } from '@memoflow/ai';

export interface DesktopNativePanelBridgeOptions {
  getMainWindow: () => BrowserWindow | null;
  isActive: () => boolean;
  commandTimeoutMs?: number;
}

export interface IDesktopNativePanelBridge {
  executeCommand(
    context: LocalToolContext,
    command: GoalPanelCommand,
  ): Promise<NativePanelIpcResponse>;
  releaseAllForRun?(conversationId: string, runId: string): Promise<void>;
  dispose?(): void;
}

export class DesktopNativePanelBridge implements IDesktopNativePanelBridge {
  // Only one Electron IPC handler may own this channel at a time. Each Profile
  // creates a new bridge; a stale Profile must never consume its responses.
  private static activeBridge: DesktopNativePanelBridge | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: NativePanelIpcResponse) => void;
      reject: (reason: any) => void;
      timer: NodeJS.Timeout;
      cleanup: () => void;
      sender: BrowserWindow['webContents'];
    }
  >();

  constructor(private readonly options: DesktopNativePanelBridgeOptions) {
    DesktopNativePanelBridge.activeBridge?.dispose();
    this.setupIpcListener();
    DesktopNativePanelBridge.activeBridge = this;
  }

  private setupIpcListener() {
    ipcMain.removeHandler(AIChannels.LOCAL_AGENT_PANEL_RESPONSE);
    ipcMain.handle(AIChannels.LOCAL_AGENT_PANEL_RESPONSE, (event, payload: unknown) => {
      const window = this.options.getMainWindow();
      if (
        !this.options.isActive() ||
        !window ||
        window.isDestroyed() ||
        event.sender !== window.webContents
      )
        return { ok: false };
      const parsed = NativePanelIpcResponseSchema.safeParse(payload);
      if (!parsed.success) return { ok: false };

      const pending = this.pendingRequests.get(parsed.data.requestId);
      if (!pending || event.sender !== pending.sender) return { ok: false };
      pending.cleanup();
      this.pendingRequests.delete(parsed.data.requestId);
      pending.resolve(parsed.data);
      return { ok: true };
    });
  }

  async executeCommand(
    context: LocalToolContext,
    command: GoalPanelCommand,
  ): Promise<NativePanelIpcResponse> {
    if (DesktopNativePanelBridge.activeBridge !== this || !this.options.isActive()) {
      throw new Error('Active profile is locked, switched, or inactive');
    }

    if (context.signal?.aborted) {
      throw new Error('Panel command was aborted');
    }

    const win = this.options.getMainWindow();
    if (!win || win.isDestroyed()) {
      throw new Error('No active window available to execute panel command');
    }

    const requestId = randomUUID();
    const timeoutMs = this.options.commandTimeoutMs ?? 15000;

    return new Promise<NativePanelIpcResponse>((resolve, reject) => {
      const fail = (error: Error) => {
        if (!this.pendingRequests.has(requestId)) return;
        cleanup();
        this.pendingRequests.delete(requestId);
        // Also invalidate a renderer open that is still awaiting owner registration.
        if (this.options.getMainWindow() === win) {
          void this.releaseAllForRun(context.conversationId, context.runId);
        }
        reject(error);
      };
      const onAbort = () => fail(new Error('Panel command was aborted'));
      const onRendererGone = () => fail(new Error('Panel renderer or window was closed'));
      const onNavigation = (details: { isMainFrame: boolean; isSameDocument: boolean }) => {
        if (details.isMainFrame && !details.isSameDocument) onRendererGone();
      };
      const timer = setTimeout(
        () => fail(new Error(`Panel command timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      const cleanup = () => {
        clearTimeout(timer);
        context.signal?.removeEventListener('abort', onAbort);
        win.webContents.removeListener('destroyed', onRendererGone);
        win.webContents.removeListener('render-process-gone', onRendererGone);
        win.webContents.removeListener('did-start-navigation', onNavigation);
      };
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timer,
        cleanup,
        sender: win.webContents,
      });
      context.signal?.addEventListener('abort', onAbort, { once: true });
      win.webContents.on('destroyed', onRendererGone);
      win.webContents.on('render-process-gone', onRendererGone);
      win.webContents.on('did-start-navigation', onNavigation);

      const request: NativePanelIpcRequest = {
        requestId,
        identityId: context.identityId,
        conversationId: context.conversationId,
        runId: context.runId,
        command,
      };

      try {
        win.webContents.send(AIChannels.LOCAL_AGENT_PANEL_COMMAND, request);
      } catch (err) {
        cleanup();
        this.pendingRequests.delete(requestId);
        reject(err);
      }
    });
  }

  async releaseAllForRun(conversationId: string, runId: string): Promise<void> {
    const win = this.options.getMainWindow();
    if (
      !win ||
      win.isDestroyed() ||
      !this.options.isActive() ||
      DesktopNativePanelBridge.activeBridge !== this
    )
      return;

    try {
      const requestId = randomUUID();
      const request: NativePanelIpcRequest = {
        requestId,
        identityId: 'system',
        conversationId,
        runId,
        command: { action: 'release' },
      };
      win.webContents.send(AIChannels.LOCAL_AGENT_PANEL_COMMAND, request);
    } catch {
      // Best-effort cleanup
    }
  }

  dispose() {
    if (DesktopNativePanelBridge.activeBridge === this) {
      ipcMain.removeHandler(AIChannels.LOCAL_AGENT_PANEL_RESPONSE);
      DesktopNativePanelBridge.activeBridge = null;
    }
    for (const [, req] of this.pendingRequests) {
      req.cleanup();
      req.reject(new Error('DesktopNativePanelBridge was disposed'));
    }
    this.pendingRequests.clear();
  }
}
