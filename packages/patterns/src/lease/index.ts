/** Host-neutral distributed lease contract for fenced background work. */
export interface LeaseGuard {
  ensureHeld(): Promise<void>;
}

export interface LeaseCoordinatorPort {
  execute<T>(
    leaseKey: string,
    task: (guard: LeaseGuard) => Promise<T>,
  ): Promise<{ acquired: boolean; value?: T }>;
}

/** Raised when fenced work has lost ownership and must stop immediately. */
export class LeaseLostError extends Error {
  constructor(message = 'Lease ownership lost') {
    super(message);
    this.name = 'LeaseLostError';
  }
}
