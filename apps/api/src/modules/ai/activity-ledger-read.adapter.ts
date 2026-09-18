import type { IAIActivityReadPort } from '@memoflow/ai/ports';
import type { PrismaClient } from '@memoflow/database';

const DEFAULT_ACTIVITY_LIMIT = 10;

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_ACTIVITY_LIMIT;
  return Math.max(1, Math.min(DEFAULT_ACTIVITY_LIMIT, Math.trunc(limit)));
}

/**
 * Transitional AI activity capability.
 *
 * ActivityLedger is still the only API-side source for the recent activity
 * fact that the former Dashboard snapshot supplied to analytics. This narrow
 * read stays at the host edge so HOME-1804 can decide its ownership separately;
 * AI does not own or write the ledger.
 */
export class ActivityLedgerAIReadAdapter implements IAIActivityReadPort {
  constructor(private readonly db: PrismaClient) {}

  async listRecent(input: Parameters<IAIActivityReadPort['listRecent']>[0]) {
    const rows = await this.db.activityLedger.findMany({
      where: {
        identityId: input.identityId,
        occurredAt: { gte: new Date(input.since) },
      },
      orderBy: { occurredAt: 'desc' },
      take: boundedLimit(input.limit),
    });

    return rows.map((row) => ({
      id: row.id,
      type: row.action,
      description: row.title ?? `${row.subjectType}:${row.subjectId}`,
      timestamp: row.occurredAt.getTime(),
    }));
  }
}
