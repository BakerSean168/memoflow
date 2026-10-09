import type { PrismaClient } from '@memoflow/database';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('ProfileImportScheduleRecovery');

/** The pending marker commits atomically with imported facts; every process may retry safely. */
export function createProfileImportScheduleRecovery(
  db: PrismaClient,
  reconcile: (identityId: string) => Promise<boolean>,
  intervalMs = 15_000,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = true;
  let running: Promise<void> | undefined;
  async function sweep() {
    const operations = await db.profileImportOperation.findMany({
      where: { status: 'committed', schedulingReconciledAt: null },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });
    for (const operation of operations) {
      if (await reconcile(operation.identityId)) {
        await db.profileImportOperation.updateMany({
          where: { id: operation.id, status: 'committed', schedulingReconciledAt: null },
          data: { schedulingReconciledAt: new Date() },
        });
      } else {
        // Rotate failed operations to keep later imports from starving.
        await db.profileImportOperation.updateMany({
          where: { id: operation.id },
          data: { updatedAt: new Date() },
        });
      }
    }
  }
  function tick() {
    if (stopped) return;
    running = sweep()
      .catch((error) => logger.warn('Future schedule recovery will retry', { error }))
      .finally(() => {
        running = undefined;
        if (!stopped) {
          timer = setTimeout(tick, intervalMs);
          timer.unref?.();
        }
      });
  }
  return {
    sweep,
    start() {
      if (!stopped) return;
      stopped = false;
      tick();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
    async drain() {
      await running;
    },
  };
}
