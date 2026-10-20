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
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: NativePanelIpcResponse) => void;
      reject: (reason: any) => void;
      timer: NodeJS.Timeout;
    }
  >();

  constructor(private readonly options: DesktopNativePanelBridgeOptions) {
    this.setupIpcListener();
  }

  private setupIpcListener() {
    try {
      ipcMain.handle(AIChannels.LOCAL_AGENT_PANEL_RESPONSE, (_event, payload: unknown) => {
        const parsed = NativePanelIpcResponseSchema.safeParse(payload);
        if (!parsed.success) return { ok: false };

        const pending = this.pendingRequests.get(parsed.data.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(parsed.data.requestId);
          pending.resolve(parsed.data);
        }
        return { ok: true };
      });
    } catch {
      // In testing environments where ipcMain is mocked or already initialized
    }
  }

  async executeCommand(
    context: LocalToolContext,
    command: GoalPanelCommand,
  ): Promise<NativePanelIpcResponse> {
    if (!this.options.isActive()) {
      throw new Error('Active profile is locked, switched, or inactive');
    }

    const win = this.options.getMainWindow();
    if (!win || win.isDestroyed()) {
      throw new Error('No active window available to execute panel command');
    }

    const requestId = randomUUID();
    const timeoutMs = this.options.commandTimeoutMs ?? 15000;

    return new Promise<NativePanelIpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Panel command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      if (context.signal) {
        context.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            this.pendingRequests.delete(requestId);
            reject(new Error('Panel command was aborted'));
          },
          { once: true },
        );
      }

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
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        reject(err);
      }
    });
  }

  async releaseAllForRun(conversationId: string, runId: string): Promise<void> {
    const win = this.options.getMainWindow();
    if (!win || win.isDestroyed() || !this.options.isActive()) return;

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
    for (const [, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('DesktopNativePanelBridge was disposed'));
    }
    this.pendingRequests.clear();
  }
}
