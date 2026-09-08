/**
 * Schedule lease repository port (application layer).
 * Infrastructure provides the Prisma atomic implementation.
 */
export interface ScheduleLeaseRequest {
  leaseKey: string;
  ownerToken: string;
  now: number;
  expiresAt: number;
}

export interface IScheduleLeaseRepository {
  tryAcquire(request: ScheduleLeaseRequest): Promise<boolean>;
  renew(request: ScheduleLeaseRequest): Promise<boolean>;
  release(leaseKey: string, ownerToken: string): Promise<void>;
}
