import { GoalPageQuerySchema, type GoalPage } from '@memoflow/contracts/goal';
import { error, ok, type Result } from '@memoflow/contracts/result';
import type { GoalPageReadPort } from '../../ports/goal-page-read.port';

export class SearchGoalPageUseCase {
  constructor(private readonly reader: GoalPageReadPort) {}

  async execute(identityId: string, input: unknown): Promise<Result<GoalPage>> {
    const parsed = GoalPageQuerySchema.safeParse(input);
    if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid Goal page query');
    const rows = await this.reader.readPage(identityId, {
      ...parsed.data,
      limit: parsed.data.limit + 1,
    });
    const hasMore = rows.length > parsed.data.limit;
    const items = rows.slice(0, parsed.data.limit);
    const last = items[items.length - 1];
    return ok({
      items,
      hasMore,
      next: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
    });
  }
}
