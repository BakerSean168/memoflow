import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Task occurrence ownership surface (stage-6 residual 124):
 * Residual 177 collapses bare findById dual method.
 * get/complete/skip/start/delete must never authorize by bare task occurrence
 * primary key alone.
 */
describe('task occurrence ownership surface', () => {
  const port = readFileSync(
    resolve(__dirname, '../../../../domain/repositories/i-task-occurrence-repository.ts'),
    'utf8',
  );
  const prisma = readFileSync(
    resolve(__dirname, '../task-occurrence-prisma.repository.ts'),
    'utf8',
  );
  const powersync = readFileSync(
    resolve(__dirname, '../../powersync/task-occurrence-powersync.repository.ts'),
    'utf8',
  );
  const getUseCase = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/queries/get-task-occurrence.use-case.ts'),
    'utf8',
  );
  const deleteUseCase = readFileSync(
    resolve(
      __dirname,
      '../../../../application/use-cases/commands/delete-task-occurrence.use-case.ts',
    ),
    'utf8',
  );
  const listByTemplate = readFileSync(
    resolve(
      __dirname,
      '../../../../application/use-cases/queries/list-task-occurrences-by-plan.use-case.ts',
    ),
    'utf8',
  );
  const getPlan = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/queries/get-task-plan.use-case.ts'),
    'utf8',
  );
  const completeOccurrence = readFileSync(
    resolve(
      __dirname,
      '../../../../application/use-cases/commands/complete-task-occurrence.use-case.ts',
    ),
    'utf8',
  );
  const outcomeReevaluation = readFileSync(
    resolve(
      __dirname,
      '../../../../application/use-cases/commands/task-plan-outcome-reevaluation.ts',
    ),
    'utf8',
  );
  const projection = readFileSync(
    resolve(__dirname, '../../../schedule-projection-source.ts'),
    'utf8',
  );
  const pausePlan = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/commands/pause-task-plan.use-case.ts'),
    'utf8',
  );
  const deletePlan = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/commands/delete-task-plan.use-case.ts'),
    'utf8',
  );
  const listPlans = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/queries/list-task-plans.use-case.ts'),
    'utf8',
  );
  const routes = readFileSync(
    resolve(__dirname, '../../../../../api/routes/task-occurrence.routes.ts'),
    'utf8',
  );
  const electron = readFileSync(resolve(__dirname, '../../../../../electron/index.ts'), 'utf8');
  const module = readFileSync(resolve(__dirname, '../../../task.module.ts'), 'utf8');

  it('port findByIdForIdentity and delete require identityId', () => {
    expect(port).toContain(
      'findByIdForIdentity(identityId: string, id: string): Promise<TaskOccurrence | null>;',
    );
    expect(port).toContain('delete(identityId: string, id: string): Promise<void>;');
  });

  it('port drops bare findById dual method (residual 177)', () => {
    expect(port).not.toContain('findById(id: string): Promise<TaskOccurrence | null>;');
    expect(prisma).not.toMatch(/async findById\(id: string\)/);
    expect(powersync).not.toMatch(/async findById\(id: string\)/);
  });

  it('findByPlanId requires identityId (residual 133)', () => {
    expect(port).toContain(
      'findByPlanId(planId: string, identityId: string): Promise<TaskOccurrence[]>;',
    );
    expect(prisma).toContain('where: { planId: planId, identityId, deletedAt: null }');
    expect(listByTemplate).toContain('findByPlanId(planId, identityId)');
    expect(getPlan).toContain('findByPlanId(id, identityId)');
    expect(completeOccurrence).toContain('reevaluateTaskPlanOutcome(');
    expect(completeOccurrence).toContain('identityId');
    expect(outcomeReevaluation).toContain('findByPlanId(planId, identityId)');
    expect(projection).toContain('findByPlanId(');
    expect(projection).toContain('String(planDTO.identityId)');
  });

  it('plan-scoped occurrence queries require identityId (residual 134)', () => {
    expect(port).toContain('deleteByPlanId(planId: string, identityId: string)');
    expect(port).toContain('getPlanStats(');
    expect(port).toContain('identityId: string');
    expect(port).toContain('deleteIncompleteOccurrencesFrom(');
    expect(prisma).toContain('where: { planId: planId, identityId }');
    expect(prisma).toMatch(/getPlanStats\([\s\S]*identityId/);
    expect(getPlan).toMatch(
      /getPlanStats\([\s\S]*\[id\][\s\S]*identityId[\s\S]*windowStart[\s\S]*asOf/,
    );
    expect(listPlans).toContain('getPlanStats(');
    expect(listPlans).toContain('request.identityId');
    expect(listPlans).toContain('{ windowStart, asOf: asOfDate }');
    expect(pausePlan).toContain('deleteIncompleteOccurrencesFrom(');
    expect(pausePlan).toContain('identityId');
    expect(deletePlan).toContain('deleteByPlanId(id, identityId)');
  });

  it('prisma filters by id + identityId', () => {
    expect(prisma).toContain('where: { id, identityId }');
    expect(prisma).toContain('deleteMany({');
    expect(prisma).toContain(
      "throw new Error('Task occurrence not found for the current identity.');",
    );
  });

  it('get/delete use cases load via findByIdForIdentity', () => {
    expect(getUseCase).toContain('findByIdForIdentity(identityId, id)');
    expect(getUseCase).toMatch(/execute\(\s*id: string,\s*identityId: string,/);
    expect(deleteUseCase).toContain('findByIdForIdentity(identityId, id)');
    expect(deleteUseCase).toContain('delete(identityId, id)');
  });

  it('module api wrappers pass identityId for occurrence mutations', () => {
    expect(module).toMatch(/completeTaskOccurrence:\s*\(id, identityId, input\)\s*=>/);
    expect(module).toMatch(/deleteTaskOccurrence:\s*\(id, identityId\)\s*=>/);
    expect(module).toMatch(/getTaskOccurrence:\s*\(id, identityId\)\s*=>/);
  });

  it('HTTP and Electron occurrence get/delete pass identity context (Phase 4)', () => {
    // Read/query routes keep expressAdapter with controller-side identity scope.
    expect(routes).toContain('controller.getOccurrence(req.params!.id, ctx)');

    // Phase 4: mutation routes bind contract invocation schemas through the
    // validation-aware registrar; the controller still receives the canonical
    // identity-bearing context.
    expect(routes).toContain('routeWithValidation');
    expect(routes).toMatch(/controller\.deleteOccurrence\(data\.params\.id, ctx\)/);
    expect(routes).toMatch(/controller\.completeOccurrence\(data\.params\.id, data\.body, ctx\)/);
    expect(electron).toContain('registerValidatedChannel');
    expect(electron).toMatch(
      /OCCURRENCE_GET[\s\S]*instanceController\.getOccurrence\([\s\S]*requestContext/,
    );
    expect(electron).toMatch(
      /OCCURRENCE_DELETE[\s\S]*instanceController\.deleteOccurrence\(data\.params\.id,[\s\S]*requestContext/,
    );
    expect(electron).not.toContain('instanceController.getOccurrence(payload?.id ?? payload),');
  });

  it('port deleteMany requires identityId (residual 157)', () => {
    expect(port).toContain('deleteMany(identityId: string, ids: string[]): Promise<void>;');
  });

  it('prisma/powersync deleteMany filter by identity (residual 157)', () => {
    expect(prisma).toContain('async deleteMany(identityId: string, ids: string[])');
    expect(prisma).toContain('where: { id: { in: ids }, identityId }');
    expect(powersync).toContain(
      'DELETE FROM task_occurrences WHERE identity_id = ? AND id IN (${placeholders})',
    );
  });
});
