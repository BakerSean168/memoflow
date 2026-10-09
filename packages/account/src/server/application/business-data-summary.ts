import {
  BusinessDataOwnerSchema,
  BusinessDataSummarySchema,
  type BusinessDataOwner,
  type BusinessDataSummary,
} from '@memoflow/contracts/account';

/** Host-composed owner probes. Missing or unavailable owners remain unknown. */
export type BusinessDataPresenceReaders = Partial<
  Record<BusinessDataOwner, (identityId: string) => Promise<boolean>>
>;
export type BusinessDataSummaryReader = (identityId: string) => Promise<BusinessDataSummary>;

/** Compose existence observations without interpreting another owner's data. */
export function createBusinessDataSummaryReader(
  readers: BusinessDataPresenceReaders,
  options: { timeoutMs?: number } = {},
): BusinessDataSummaryReader {
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid summary timeout');
  return async (identityId) => {
    if (!identityId.trim()) throw new Error('Business summary requires an authenticated identity');
    const owners = await Promise.all(
      BusinessDataOwnerSchema.options.map(async (owner) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const read = readers[owner];
          if (!read) return { owner, state: 'unknown' as const };
          const present = await Promise.race([
            Promise.resolve().then(() => read(identityId)),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(new Error('Summary timed out')), timeoutMs);
            }),
          ]);
          return {
            owner,
            state:
              present === true
                ? ('non_empty' as const)
                : present === false
                  ? ('empty' as const)
                  : ('unknown' as const),
          };
        } catch {
          return { owner, state: 'unknown' as const };
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    const state = owners.some((owner) => owner.state === 'non_empty')
      ? 'non_empty'
      : owners.every((owner) => owner.state === 'empty')
        ? 'empty'
        : 'unknown';
    return BusinessDataSummarySchema.parse({
      schemaVersion: 1,
      state,
      observedAt: new Date().toISOString(),
      owners,
    });
  };
}
