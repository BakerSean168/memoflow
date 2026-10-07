import { describe, expect, it, vi } from 'vitest';
import { SearchGoalPageUseCase } from '../search-goal-page.use-case';

describe('bounded Goal owner search', () => {
  it('validates page size before querying owner persistence', async () => {
    const readPage = vi.fn();
    const query = new SearchGoalPageUseCase({ readPage });
    expect(await query.execute('identity-a', { limit: 101 })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(readPage).not.toHaveBeenCalled();
  });

  it('passes trusted identity and normalized keyset filters to the read port', async () => {
    const readPage = vi.fn().mockResolvedValue([]);
    const query = new SearchGoalPageUseCase({ readPage });
    expect(await query.execute('identity-a', { query: '  Work  ', limit: 2 })).toMatchObject({
      ok: true,
      data: { items: [], hasMore: false, next: null },
    });
    expect(readPage).toHaveBeenCalledWith('identity-a', { query: 'Work', limit: 3 });
  });
});
