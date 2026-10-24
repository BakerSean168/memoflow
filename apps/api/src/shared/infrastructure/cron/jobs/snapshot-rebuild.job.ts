import { prisma } from '@memoflow/database';
import { createLogger } from '@memoflow/utils/logger';
import { buildProfileSnapshot } from '../../../../modules/powersync/snapshot-builder.js';
import { getPowerSyncConfig } from '../../config/env.js';

const logger = createLogger('SnapshotRebuildJob');

const MAX_CONCURRENT_BUILDS = 2;

export async function rebuildAllProfileSnapshots(snapshotRootDir: string): Promise<void> {
  const config = getPowerSyncConfig();

  if (!config.url || !config.privateKey) {
    logger.warn('PowerSync config incomplete, skipping snapshot rebuild');
    return;
  }

  const accounts = await prisma.account.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });

  if (accounts.length === 0) {
    logger.info('No active accounts found, skipping snapshot rebuild');
    return;
  }

  logger.info(`Rebuilding snapshots for ${accounts.length} accounts`);

  let succeeded = 0;
  let failed = 0;

  // Process in batches to limit concurrency
  for (let i = 0; i < accounts.length; i += MAX_CONCURRENT_BUILDS) {
    const batch = accounts.slice(i, i + MAX_CONCURRENT_BUILDS);

    const results = await Promise.allSettled(
      batch.map((account) =>
        buildProfileSnapshot({
          identityId: account.id,
          snapshotRootDir,
          powersyncUrl: config.url!,
          privateKey: config.privateKey!,
          keyId: config.keyId,
          version: new Date().toISOString(),
        }),
      ),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j]!;
      if (result.status === 'fulfilled') {
        succeeded++;
      } else {
        failed++;
        logger.error('Snapshot build failed', {
          identityId: batch[j]!.id,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  }

  logger.info('Snapshot rebuild batch complete', {
    total: accounts.length,
    succeeded,
    failed,
  });
}
