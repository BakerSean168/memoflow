import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Task plan ownership surface (stage-6 residual 123 + 140):
 * get/update/delete/actions and list-occurrences-by-plan must never authorize
 * by bare task plan primary key alone; folder/goal list filters are identity-scoped.
 * Residual 177 collapses bare findById dual method.
 */
describe('task plan ownership surface', () => {
  const port = readFileSync(
    resolve(__dirname, '../../../../domain/repositories/i-task-plan-repository.ts'),
    'utf8',
  );
  const prisma = readFileSync(resolve(__dirname, '../task-plan-prisma.repository.ts'), 'utf8');
  const powersync = readFileSync(
    resolve(__dirname, '../../powersync/task-plan-powersync.repository.ts'),
    'utf8',
  );
  const getUseCase = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/queries/get-task-plan.use-case.ts'),
    'utf8',
  );
  const deleteUseCase = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/commands/delete-task-plan.use-case.ts'),
    'utf8',
  );
  const routes = readFileSync(
    resolve(__dirname, '../../../../../api/routes/task-plan.routes.ts'),
    'utf8',
  );
  const electron = readFileSync(resolve(__dirname, '../../../../../electron/index.ts'), 'utf8');
  const module = readFileSync(resolve(__dirname, '../../../task.module.ts'), 'utf8');
  const listUseCase = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/queries/list-task-plans.use-case.ts'),
    'utf8',
  );

  it('port findByIdForIdentity and delete require identityId', () => {
    expect(port).toContain(
      'findByIdForIdentity(identityId: string, id: string): Promise<TaskPlan | null>;',
    );
    expect(port).toContain('delete(identityId: string, id: string): Promise<void>;');
  });

  it('port drops bare findById dual method (residual 177)', () => {
    expect(port).not.toContain('findById(id: string): Promise<TaskPlan | null>;');
    expect(prisma).not.toMatch(/async findById\(id: string\)/);
    expect(powersync).not.toMatch(/async findById\(id: string\)/);
  });

  it('prisma filters by id + identityId', () => {
    expect(prisma).toContain('where: { id, identityId }');
    expect(prisma).toContain('deleteMany({');
    expect(prisma).toContain(
      "throw new Error('Task plan not found for the current identity.');",
    );
  });

  it('get/delete use cases load via findByIdForIdentity', () => {
    expect(getUseCase).toContain('findByIdForIdentity(identityId, id)');
    expect(getUseCase).toMatch(/execute\(\s*id: string,\s*identityId: string,/);
    expect(deleteUseCase).toContain('findByIdForIdentity(identityId, id)');
    expect(deleteUseCase).toContain('delete(identityId, id)');
  });

  it('module api wrappers pass identityId for plan mutations', () => {
    expect(module).toMatch(/updateTaskPlan:\s*\(id, identityId, input\)\s*=>/);
    expect(module).toMatch(/deleteTaskPlan:\s*\(id, identityId\)\s*=>/);
    expect(module).toMatch(/getTaskPlan:\s*\(id, identityId\)\s*=>/);
  });

  it('HTTP and Electron plan get/delete pass identity context (Phase 4)', () => {
    // Read/query routes keep expressAdapter with controller-side identity scope.
    expect(routes).toContain('controller.getPlan(req.params!.id, ctx)');

    // Phase 4: mutation routes bind contract invocation schemas through the
    // validation-aware registrar; the controller still receives the canonical
    // identity-bearing context (never a body identity).
    expect(routes).toContain('routeWithValidation');
    expect(routes).toMatch(/controller\.deletePlan\(data\.params\.id, ctx\)/);
    expect(routes).toMatch(/controller\.activatePlan\(data\.params\.id, ctx\)/);
    expect(electron).toContain('registerValidatedChannel');
    expect(electron).toMatch(
      /PLAN_GET[\s\S]*templateController\.getPlan\([\s\S]*requestContext/,
    );
    expect(electron).toMatch(
      /PLAN_DELETE[\s\S]*templateController\.deletePlan\(data\.params\.id,[\s\S]*requestContext/,
    );
    expect(electron).not.toContain('includeChildren');
  });

  it('findByGoalId remains identity scoped while folder lookup is retired', () => {
    expect(port).toContain(
      'findByGoalId(identityId: string, goalId: string): Promise<TaskPlan[]>;',
    );
    expect(prisma).toContain('async findByGoalId(identityId: string, goalId: string)');
    expect(listUseCase).toContain('findByGoalId(request.identityId, request.goalId)');
    expect(port).not.toContain('findByFolderId');
    expect(prisma).not.toContain('findByFolderId');
  });

  it('findByGoalAndKeyResultId remains identity + Goal scoped while hierarchy lookup is retired', () => {
    expect(port).toContain('findByGoalAndKeyResultId(');
    expect(port).toContain('goalId: string');
    expect(port).toContain('keyResultId: string');
    expect(prisma).toContain('async findByGoalAndKeyResultId(');
    expect(prisma).toMatch(/identityId,\s*goalId,\s*keyResultId,\s*deletedAt: null/);
    expect(port).not.toContain('findSubtasks');
    expect(prisma).not.toContain('findSubtasks');
  });

  it('port deleteBatch requires identityId (residual 156)', () => {
    expect(port).toContain('deleteBatch(identityId: string, ids: string[]): Promise<void>;');
  });

  it('prisma/powersync deleteBatch filter by identity (residual 156)', () => {
    expect(prisma).toContain('async deleteBatch(identityId: string, ids: string[])');
    expect(prisma).toContain('where: { id: { in: ids }, identityId }');
    expect(powersync).toContain(
      'DELETE FROM task_plans WHERE identity_id = ? AND id IN (${placeholders})',
    );
  });

  it('port softDelete/restore require identityId (residual 159)', () => {
    expect(port).toContain('softDelete(identityId: string, id: string): Promise<void>;');
    expect(port).toContain('restore(identityId: string, id: string): Promise<void>;');
  });

  it('prisma/powersync softDelete/restore filter by identity (residual 159)', () => {
    expect(prisma).toContain('async softDelete(identityId: string, id: string)');
    expect(prisma).toContain('async restore(identityId: string, id: string)');
    expect(prisma).toContain('where: { id, identityId }');
    expect(prisma).toContain(
      "throw new Error('Task plan not found for the current identity.');",
    );
    expect(powersync).toContain(
      'UPDATE task_plans SET deleted_at = ?, updated_at = ? WHERE id = ? AND identity_id = ?',
    );
    expect(powersync).toContain(
      'UPDATE task_plans SET deleted_at = NULL, archived_at = NULL, updated_at = ? WHERE id = ? AND identity_id = ?',
    );
  });

  it('keeps Plan repository aggregate-only and composes occurrence children in the query layer', () => {
    const getUseCase = readFileSync(
      resolve(__dirname, '../../../../application/use-cases/queries/get-task-plan.use-case.ts'),
      'utf8',
    );

    expect(port).not.toContain('findByIdWithChildren');
    expect(prisma).not.toContain('findByIdWithChildren');
    expect(powersync).not.toContain('findByIdWithChildren');
    expect(getUseCase).toContain('findByIdForIdentity(identityId, id)');
    expect(getUseCase).toContain('occurrenceRepository.findByPlanId(id, identityId)');
  });
});
