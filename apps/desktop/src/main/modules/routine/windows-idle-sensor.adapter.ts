import { powerMonitor } from 'electron';
import { asInstant } from '@memoflow/time';
import type {
  IdleSensorPort,
  UserIdleObserved,
  UserResumeObserved,
} from '@memoflow/routine/routine-runtime';

interface ElectronIdleCapability {
  getSystemIdleTime(): number;
}

export interface WindowsIdleSensorAdapterOptions {
  readonly idleThresholdMs: number;
  readonly pollIntervalMs?: number;
  readonly now?: () => number;
  readonly capability?: ElectronIdleCapability;
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
}

/**
 * Windows-first desktop adapter. Electron owns the OS-specific input query;
 * Routine receives only IdleSensorPort events and never imports Electron/Win32.
 */
export class WindowsIdleSensorAdapter implements IdleSensorPort {
  private readonly capability: ElectronIdleCapability;
  private readonly idleThresholdMs: number;
  private readonly pollIntervalMs: number;
  private readonly now: () => number;
  private readonly setIntervalFn: typeof globalThis.setInterval;
  private readonly clearIntervalFn: typeof globalThis.clearInterval;
  private readonly idleListeners = new Set<(event: UserIdleObserved) => void>();
  private readonly resumeListeners = new Set<(event: UserResumeObserved) => void>();
  private timer: ReturnType<typeof globalThis.setInterval> | null = null;
  private idle = false;
  private lastIdleDurationMs = 0;

  constructor(options: WindowsIdleSensorAdapterOptions) {
    if (!Number.isFinite(options.idleThresholdMs) || options.idleThresholdMs <= 0) {
      throw new TypeError('idleThresholdMs must be a positive finite number');
    }
    const pollIntervalMs = options.pollIntervalMs ?? 1_000;
    if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
      throw new TypeError('pollIntervalMs must be a positive finite number');
    }
    this.capability = options.capability ?? powerMonitor;
    this.idleThresholdMs = options.idleThresholdMs;
    this.pollIntervalMs = pollIntervalMs;
    this.now = options.now ?? Date.now;
    this.setIntervalFn = options.setInterval ?? globalThis.setInterval;
    this.clearIntervalFn = options.clearInterval ?? globalThis.clearInterval;
  }

  get isPolling(): boolean {
    return this.timer !== null;
  }

  getIdleDurationMs(): number {
    return Math.max(0, this.capability.getSystemIdleTime() * 1_000);
  }

  onIdle(listener: (event: UserIdleObserved) => void): () => void {
    this.idleListeners.add(listener);
    this.ensurePolling();
    return () => {
      this.idleListeners.delete(listener);
      this.stopWhenUnused();
    };
  }

  onResume(listener: (event: UserResumeObserved) => void): () => void {
    this.resumeListeners.add(listener);
    this.ensurePolling();
    return () => {
      this.resumeListeners.delete(listener);
      this.stopWhenUnused();
    };
  }

  dispose(): void {
    this.idleListeners.clear();
    this.resumeListeners.clear();
    this.stopPolling();
  }

  private ensurePolling(): void {
    if (this.timer !== null) return;
    const currentIdleMs = this.getIdleDurationMs();
    this.idle = currentIdleMs >= this.idleThresholdMs;
    this.lastIdleDurationMs = currentIdleMs;
    this.timer = this.setIntervalFn(() => this.sample(), this.pollIntervalMs);
    this.timer.unref?.();
  }

  private sample(): void {
    const idleDurationMs = this.getIdleDurationMs();
    const nextIdle = idleDurationMs >= this.idleThresholdMs;
    const at = asInstant(this.now());

    if (!this.idle && nextIdle) {
      this.idle = true;
      this.lastIdleDurationMs = idleDurationMs;
      const event = { at, idleDurationMs };
      for (const listener of [...this.idleListeners]) listener(event);
      return;
    }

    if (this.idle && !nextIdle) {
      const event = { at, idleDurationMs: this.lastIdleDurationMs };
      this.idle = false;
      this.lastIdleDurationMs = idleDurationMs;
      for (const listener of [...this.resumeListeners]) listener(event);
      return;
    }

    this.lastIdleDurationMs = Math.max(this.lastIdleDurationMs, idleDurationMs);
  }

  private stopWhenUnused(): void {
    if (this.idleListeners.size === 0 && this.resumeListeners.size === 0) {
      this.stopPolling();
    }
  }

  private stopPolling(): void {
    if (this.timer === null) return;
    this.clearIntervalFn(this.timer);
    this.timer = null;
    this.idle = false;
    this.lastIdleDurationMs = 0;
  }
}
