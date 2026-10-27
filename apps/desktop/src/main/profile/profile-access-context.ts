import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { ElectronAuthResolutionError } from '@memoflow/desktop-contracts';
import type { IElectronAuthContext } from '@memoflow/desktop-contracts';

/**
 * Electron business modules need a local owner, not a cloud session.
 * Cloud availability is intentionally absent from this seam.
 *
 * RefArch Phase 2: every `requireRequestContext()` invocation resolves the
 * owner exactly once and produces a fresh `ExecutionContext` with a new
 * requestId, an identical traceId (equal to the requestId in this phase),
 * `startedAt` from the injected clock and `source: 'ipc'`.
 */
export class DesktopProfileAccessContext implements IElectronAuthContext {
  constructor(
    private readonly resolveOwner: () => string | null,
    private readonly deviceId: string = 'desktop-app',
    private readonly idFactory: () => string = randomUUID,
    private readonly now: () => number = Date.now,
  ) {}

  async getIdentityId(): Promise<string | null> {
    return this.resolveOwner();
  }

  async requireIdentityId(): Promise<string> {
    const identityId = this.resolveOwner();
    if (!identityId) throw new ElectronAuthResolutionError('AUTH_REQUIRED');
    return identityId;
  }

  async getSessionId(): Promise<string | null> {
    return null;
  }

  async getRequestContext(): Promise<ExecutionContext | null> {
    const identityId = this.resolveOwner();
    if (!identityId) return null;

    const requestId = this.idFactory();
    return {
      requestId,
      traceId: requestId,
      startedAt: this.now(),
      source: 'ipc',
      identityId,
      deviceId: this.deviceId,
    };
  }

  async requireRequestContext(): Promise<ExecutionContext> {
    const context = await this.getRequestContext();
    if (!context) throw new ElectronAuthResolutionError('AUTH_REQUIRED');
    return context;
  }

  async isAuthenticated(): Promise<boolean> {
    return this.resolveOwner() !== null;
  }
}
