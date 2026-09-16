import type { InvocationAttempt } from '@memoflow/contracts/schedule';

export interface IInvocationAttemptRepository {
  append(attempt: InvocationAttempt): Promise<void>;
  findByIdForIdentity(identityId: string, id: string): Promise<InvocationAttempt | null>;
  listForInvocation(
    identityId: string,
    invocationId: string,
    options?: { readonly limit?: number; readonly before?: number },
  ): Promise<InvocationAttempt[]>;
  findLatestForInvocation(identityId: string, invocationId: string): Promise<InvocationAttempt | null>;
}
