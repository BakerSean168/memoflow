import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Goal ownership surface (stage-6 residual 117/118):
 * Residual 178 collapses bare findById dual method.
 * goal aggregate + status + KR/review + idempotent create + records/progress must identity-scope
 * repository reads — never authorize by bare goal/record primary key alone.
 */
describe('goal ownership surface', () => {
  const port = readFileSync(
    resolve(__dirname, '../../../../domain/repositories/i-goal-repository.ts'),
    'utf8',
  );
  const recordPort = readFileSync(
    resolve(__dirname, '../../../../domain/repositories/i-goal-record-repository.ts'),
    'utf8',
  );
  const prisma = readFileSync(resolve(__dirname, '../goal-prisma.repository.ts'), 'utf8');
  const powersync = readFileSync(
    resolve(__dirname, '../../powersync/goal-powersync.repository.ts'),
    'utf8',
  );
  const recordPrisma = readFileSync(
    resolve(__dirname, '../goal-record-prisma.repository.ts'),
    'utf8',
  );
  const recordPowersync = readFileSync(
    resolve(__dirname, '../../powersync/goal-record-powersync.repository.ts'),
    'utf8',
  );
  const getUseCase = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/queries/get-goal.use-case.ts'),
    'utf8',
  );
  const getAggregate = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/queries/get-goal-aggregate.use-case.ts'),
    'utf8',
  );
  const createRecord = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/commands/create-goal-record.use-case.ts'),
    'utf8',
  );
  const deleteRecord = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/commands/delete-goal-record.use-case.ts'),
    'utf8',
  );
  const archiveUseCase = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/commands/archive-goal.use-case.ts'),
    'utf8',
  );
  const activateUseCase = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/commands/activate-goal.use-case.ts'),
    'utf8',
  );
  const completeUseCase = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/commands/complete-goal.use-case.ts'),
    'utf8',
  );
  const abandonUseCase = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/commands/abandon-goal.use-case.ts'),
    'utf8',
  );
  const permanentUseCase = readFileSync(
    resolve(
      __dirname,
      '../../../../application/use-cases/commands/permanently-delete-goal.use-case.ts',
    ),
    'utf8',
  );
  const addKeyResult = readFileSync(
    resolve(
      __dirname,
      '../../../../application/use-cases/commands/add-goal-key-result.use-case.ts',
    ),
    'utf8',
  );
  const deleteKeyResult = readFileSync(
    resolve(
      __dirname,
      '../../../../application/use-cases/commands/delete-goal-key-result.use-case.ts',
    ),
    'utf8',
  );
  const addReview = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/commands/add-goal-review.use-case.ts'),
    'utf8',
  );
  const deleteReview = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/commands/delete-goal-review.use-case.ts'),
    'utf8',
  );
  const listReviews = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/queries/list-goal-reviews.use-case.ts'),
    'utf8',
  );
  const keyResultRoutes = readFileSync(
    resolve(__dirname, '../../../../../api/routes/key-result.routes.ts'),
    'utf8',
  );
  const reviewRoutes = readFileSync(
    resolve(__dirname, '../../../../../api/routes/review.routes.ts'),
    'utf8',
  );
  const createGoal = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/commands/create-goal.use-case.ts'),
    'utf8',
  );
  const listRecords = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/queries/list-goal-records.use-case.ts'),
    'utf8',
  );
  const crossModule = readFileSync(
    resolve(
      __dirname,
      '../../../../application/use-cases/queries/goal-cross-module-query-service.use-case.ts',
    ),
    'utf8',
  );
  const routes = readFileSync(
    resolve(__dirname, '../../../../../api/routes/goal.routes.ts'),
    'utf8',
  );
  const recordRoutes = readFileSync(
    resolve(__dirname, '../../../../../api/routes/goal-record.routes.ts'),
    'utf8',
  );
  const electron = readFileSync(resolve(__dirname, '../../../../../electron/index.ts'), 'utf8');

  it('port findByIdForIdentity requires identityId', () => {
    expect(port).toContain(
      'findByIdForIdentity(\n    identityId: string,\n    id: string,\n    options?: { includeChildren?: boolean },\n  ): Promise<Goal | null>;',
    );
    expect(port).toContain('delete(identityId: string, id: string): Promise<void>;');
    expect(recordPort).toContain(
      'findByIdForIdentity(identityId: string, recordId: string): Promise<GoalRecord | null>;',
    );
    expect(recordPort).toContain('delete(identityId: string, recordId: string): Promise<void>;');
  });

  it('port drops bare findById dual method (residual 178)', () => {
    expect(port).not.toContain(
      'findById(id: string, options?: { includeChildren?: boolean }): Promise<Goal | null>;',
    );
    expect(prisma).not.toMatch(/async findById\(id: string, options\?/);
    expect(powersync).not.toMatch(/async findById\(id: string, options\?/);
  });

  it('prisma filters by id + identityId', () => {
    expect(prisma).toContain('where: { id, identityId }');
    expect(prisma).toContain('deleteMany({');
    expect(prisma).toContain("throw new Error('Goal not found for the current identity.');");
    expect(recordPrisma).toContain('where: { id: recordId, identityId }');
    expect(recordPrisma).toContain('deleteMany({');
    expect(recordPrisma).toContain(
      "throw new Error('Goal record not found for the current identity.');",
    );
  });

  it('get and aggregate use cases load via findByIdForIdentity', () => {
    expect(getUseCase).toContain('findByIdForIdentity(identityId, id,');
    expect(getUseCase).toMatch(
      /execute\(\s*id: string,\s*identityId: string,\s*includeChildren\?: boolean/,
    );
    expect(getAggregate).toContain('findByIdForIdentity(identityId, goalId,');
    expect(getAggregate).toMatch(/execute\(goalId: string, identityId: string\)/);
  });

  it('record create/delete identity-scope owned reads', () => {
    expect(createRecord).toContain('findByIdForIdentity(identityId, goalId,');
    expect(deleteRecord).toContain('findByIdForIdentity(identityId, recordId)');
    expect(deleteRecord).toContain('delete(identityId, recordId)');
    expect(deleteRecord).toMatch(
      /execute\([\s\S]*goalId: string,[\s\S]*keyResultId: string,[\s\S]*recordId: string,[\s\S]*identityId: string,[\s\S]*expectedVersion: number/,
    );
    expect(deleteRecord).toContain('saveRootWithExpectedVersion(goal, expectedVersion)');
  });

  it('status mutation use cases load via findByIdForIdentity', () => {
    for (const useCase of [archiveUseCase, activateUseCase, completeUseCase, abandonUseCase]) {
      expect(useCase).toMatch(/findByIdForIdentity\(identityId, id, \{\s*includeChildren: true,/);
      expect(useCase).toMatch(/expectedVersion: number/);
      expect(useCase).toContain('saveRootWithExpectedVersion(goal, expectedVersion)');
    }
    expect(permanentUseCase).toContain('findByIdForIdentity(identityId, id,');
    expect(permanentUseCase).toContain(
      'deleteWithExpectedVersion(identityId, id, expectedVersion)',
    );
  });

  it('key-result and review use cases load via findByIdForIdentity', () => {
    expect(addKeyResult).toContain('findByIdForIdentity(identityId, goalId,');
    expect(addKeyResult).toMatch(/goalId: string,\s*identityId: string,/);
    expect(deleteKeyResult).toContain('findByIdForIdentity(identityId, goalId,');
    expect(addReview).toContain('findByIdForIdentity(identityId, goalId,');
    expect(deleteReview).toContain('findByIdForIdentity(identityId, goalId,');
    expect(listReviews).toContain('findByIdForIdentity(identityId, goalId,');
    expect(listReviews).toMatch(/execute\(goalId: string, identityId: string\)/);
  });

  it('idempotent create, records, progress and cross-module use owned reads', () => {
    expect(createGoal).toContain('findByIdForIdentity(cx.identityId, input.id,');
    expect(createGoal).toContain('createGoalMutationReceipt');
    expect(createGoal).toMatch(/catch \(caughtError\)/);
    expect(listRecords).toContain('identityId: string;');
    expect(listRecords).toContain('findByIdForIdentity(identityId, goalId,');
    expect(listRecords).toContain('String(record.identityId) === identityId');
    expect(crossModule).toContain('findByIdForIdentity(identityId, goalId)');
  });

  it('HTTP and Electron get/update/delete/record pass identity context (Phase 4)', () => {
    // Read/query routes keep expressAdapter with controller-side identity scope.
    expect(routes).toContain('controller.get(');
    expect(routes).toMatch(/controller\.get\(\s*req\.params!\.id,\s*ctx,/);
    expect(routes).toContain('controller.getAggregate(req.params!.id, ctx)');

    // Phase 4: mutation routes bind contract invocation schemas through the
    // validation-aware registrar; the controller still receives the canonical
    // identity-bearing context (never a body identity).
    expect(routes).toContain('routeWithValidation');
    expect(routes).toMatch(/controller\.update\(data\.params\.id, data\.body, ctx\)/);
    expect(routes).toMatch(
      /controller\.delete\(data\.params\.id, data\.query\.expectedVersion, ctx\)/,
    );
    expect(routes).toMatch(
      /controller\.archive\(data\.params\.id, data\.body\.expectedVersion, ctx\)/,
    );
    expect(routes).toMatch(
      /controller\.abandon\(data\.params\.id, data\.body\.expectedVersion, ctx\)/,
    );
    expect(routes).toMatch(
      /controller\.activate\(data\.params\.id, data\.body\.expectedVersion, ctx\)/,
    );
    expect(routes).toMatch(
      /controller\.complete\(data\.params\.id, data\.body\.expectedVersion, ctx\)/,
    );
    expect(recordRoutes).toMatch(
      /controller\.deleteRecord\([\s\S]*data\.params\.id,[\s\S]*data\.params\.krId,[\s\S]*data\.params\.recordId,[\s\S]*data\.query,[\s\S]*ctx/,
    );
    expect(keyResultRoutes).toMatch(
      /controller\.addKeyResult\(data\.params\.id, data\.body, ctx\)/,
    );
    expect(keyResultRoutes).toMatch(
      /controller\.deleteKeyResult\(data\.params\.id, data\.params\.krId, data\.query, ctx\)/,
    );
    expect(reviewRoutes).toMatch(/controller\.addReview\(data\.params\.id, data\.body, ctx\)/);
    expect(reviewRoutes).toMatch(
      /controller\.deleteReview\(data\.params\.id, data\.params\.reviewId, data\.query, ctx\)/,
    );

    // Electron IPC mutation handlers validate the projected canonical input via
    // ipcAdapterWithValidation (withAuthenticatedValidation) and still thread
    // the canonical requestContext into the controller.
    expect(electron).toContain('registerValidatedChannel');
    expect(electron).toContain('withAuthenticatedValidation');
    expect(electron).toMatch(
      /GoalChannels\.GET[\s\S]*goalController\.get\(id, requestContext, includeChildren\)/,
    );
    expect(electron).toMatch(
      /GoalChannels\.UPDATE[\s\S]*goalController\.update\(data\.params\.id, data\.body, requestContext\)/,
    );
    expect(electron).toMatch(
      /GoalChannels\.DELETE[\s\S]*goalController\.delete\(data\.params\.id, data\.query\.expectedVersion, requestContext\)/,
    );
    expect(electron).toMatch(
      /GoalChannels\.AGGREGATE[\s\S]*goalController\.getAggregate\(id, requestContext\)/,
    );
    expect(electron).toMatch(
      /RECORD_DELETE[\s\S]*goalController\.deleteRecord\([\s\S]*data\.params\.id,[\s\S]*data\.params\.krId,[\s\S]*data\.params\.recordId,[\s\S]*data\.query,[\s\S]*requestContext/,
    );
    expect(electron).toMatch(
      /GoalChannels\.ARCHIVE[\s\S]*goalController\.archive\(data\.params\.id, data\.body\.expectedVersion, requestContext\)/,
    );
    expect(electron).toMatch(
      /GoalChannels\.ABANDON[\s\S]*goalController\.abandon\(data\.params\.id, data\.body\.expectedVersion, requestContext\)/,
    );
    expect(electron).toMatch(
      /GoalChannels\.ACTIVATE[\s\S]*goalController\.activate\(data\.params\.id, data\.body\.expectedVersion, requestContext\)/,
    );
    expect(electron).toMatch(
      /GoalChannels\.COMPLETE[\s\S]*goalController\.complete\(data\.params\.id, data\.body\.expectedVersion, requestContext\)/,
    );
    expect(electron).toMatch(
      /KEY_RESULT_ADD[\s\S]*goalController\.addKeyResult\(data\.params\.id, data\.body, requestContext\)/,
    );
    expect(electron).toMatch(
      /KEY_RESULT_DELETE[\s\S]*goalController\.deleteKeyResult\([\s\S]*data\.params\.id,[\s\S]*data\.params\.krId,[\s\S]*data\.query,[\s\S]*requestContext/,
    );
    expect(electron).toMatch(
      /REVIEW_CREATE[\s\S]*goalController\.addReview\(data\.params\.id, data\.body, requestContext\)/,
    );
    expect(electron).toMatch(
      /REVIEW_DELETE[\s\S]*goalController\.deleteReview\([\s\S]*data\.params\.id,[\s\S]*data\.params\.reviewId,[\s\S]*data\.query,[\s\S]*requestContext/,
    );
    expect(electron).toMatch(/KEY_RESULT_BATCH_UPDATE_WEIGHTS[\s\S]*requestContext/);
    expect(routes).not.toContain('progress-breakdown');
    expect(electron).not.toContain('PROGRESS_BREAKDOWN');
    expect(electron).toMatch(
      /RECORD_LIST_BY_GOAL[\s\S]*listRecordsByGoal\(goalId, params \?\? undefined, requestContext\)/,
    );
    expect(electron).toMatch(/RECORD_LIST_BY_KEY_RESULT[\s\S]*requestContext/);
  });

  it('goal record secondary queries require identityId (residual 141)', () => {
    expect(recordPort).toMatch(/findByKeyResultId\(\s*identityId: string,\s*keyResultId: string,/);
    expect(recordPort).toMatch(/findByGoalId\(\s*identityId: string,\s*goalId: string,/);
    expect(recordPort).toMatch(
      /findByKeyResultIds\(\s*identityId: string,\s*keyResultIds: string\[\],/,
    );
    expect(recordPort).toContain(
      'countByKeyResultId(identityId: string, keyResultId: string): Promise<number>;',
    );
    expect(recordPrisma).toContain('where: { identityId, keyResultId }');
    expect(recordPrisma).not.toContain('identityId, keyResultId, deletedAt: null');
    expect(prisma).toContain('async replaceLabels(');
    expect(prisma).toContain('where: { id: goalId, identityId }');
    expect(prisma).toContain('where: { identityId, goalId }');
    expect(prisma).not.toContain('async findByFolderId(');
  });

  it('record port deleteMany requires identityId (residual 154)', () => {
    expect(recordPort).toContain(
      'deleteMany(identityId: string, recordIds: string[]): Promise<void>;',
    );
  });

  it('record prisma/powersync deleteMany filter by identity (residual 154)', () => {
    expect(recordPrisma).toContain('async deleteMany(identityId: string, recordIds: string[])');
    expect(recordPrisma).toContain('where: { id: { in: recordIds }, identityId }');
    expect(recordPowersync).toContain(
      'DELETE FROM goal_records WHERE identity_id = ? AND id IN (${placeholders})',
    );
  });

  it('port exists/batchUpdateStatus require identityId (residual 158)', () => {
    expect(port).toContain('exists(identityId: string, id: string): Promise<boolean>;');
    expect(port).toContain(
      'batchUpdateStatus(identityId: string, ids: string[], status: string): Promise<void>;',
    );
  });

  it('prisma/powersync exists and batchUpdateStatus filter by identity (residual 158)', () => {
    expect(prisma).toContain('async exists(identityId: string, id: string)');
    expect(prisma).toContain('where: { id, identityId }');
    expect(prisma).toContain(
      'async batchUpdateStatus(identityId: string, ids: string[], status: string)',
    );
    expect(prisma).toContain('where: { id: { in: ids }, identityId }');
    expect(powersync).toContain(
      'UPDATE goals SET status = ?, updated_at = ? WHERE identity_id = ? AND id IN (${placeholders})',
    );
  });
});
