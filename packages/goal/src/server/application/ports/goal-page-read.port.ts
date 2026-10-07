import type { GoalClientDTO, GoalPageQuery } from '@memoflow/contracts/goal';

/** Goal owns ordering, filtering and persistence. limit includes a single lookahead row. */
export interface GoalPageReadPort {
  readPage(identityId: string, input: GoalPageQuery): Promise<GoalClientDTO[]>;
}
