import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Task template ownership surface (stage-6 residual 123 + 140):
 * get/update/delete/actions and list-instances-by-template must never authorize
 * by bare task template primary key alone; folder/goal list filters are identity-scoped.
 * Residual 177 collapses bare findById dual method.
 */
describe('task template ownership surface', () => {
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
    resolve(
      __dirname,
      '../../../../application/use-cases/commands/delete-task-plan.use-case.ts',
    ),
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
      "throw new Error('Task template not found for the current identity.');",
    );
  });

  it('get/delete use cases load via findByIdForIdentity', () => {
    expect(getUseCase).toContain('findByIdForIdentity(identityId, id)');
    expect(getUseCase).toMatch(/execute\(\s*id: string,\s*identityId: string,/);
    expect(deleteUseCase).toContain('findByIdForIdentity(identityId, id)');
    expect(deleteUseCase).toContain('delete(identityId, id)');
  });

  it('module api wrappers pass identityId for template mutations', () => {
    expect(module).toMatch(/updateTaskPlan:\s*\(id, identityId, input\)\s*=>/);
    expect(module).toMatch(/deleteTaskPlan:\s*\(id, identityId\)\s*=>/);
    expect(module).toMatch(/getTaskPlan:\s*\(id, identityId, includeChildren\)\s*=>/);
  });

  it('HTTP and Electron template get/delete pass identity context (Phase 4)', () => {
    // Read/query routes keep expressAdapter with controller-side identity scope.
    expect(routes).toContain('controller.getTemplate(req.params!.id, ctx,');

    // Phase 4: mutation routes bind contract invocation schemas through the
    // validation-aware registrar; the controller still receives the canonical
    // identity-bearing context (never a body identity).
    expect(routes).toContain('routeWithValidation');
    expect(routes).toMatch(/controller\.deleteTemplate\(data\.params\.id, ctx\)/);
    expect(routes).toMatch(/controller\.activateTemplate\(data\.params\.id, ctx\)/);
    expect(electron).toContain('registerValidatedChannel');
    expect(electron).toMatch(
      /TEMPLATE_GET[\s\S]*templateController\.getTemplate\([\s\S]*requestContext/,
    );
    expect(electron).toMatch(
      /TEMPLATE_DELETE[\s\S]*templateController\.deleteTemplate\(data\.params\.id,[\s\S]*requestContext/,
    );
    expect(electron).not.toMatch(
      /TEMPLATE_GET[\s\S]*templateController\.getTemplate\(\s*payload\?\.id \?\? payload,\s*payload\?\.includeChildren/,
    );
  });

  it('findByGoalId remains identity scoped while folder lookup is retired', () => {
    expect(port).toContain('findByGoalId(identityId: string, goalId: string): Promise<TaskPlan[]>;');
    expect(prisma).toContain('async findByGoalId(identityId: string, goalId: string)');
    expect(listUseCase).toContain('findByGoalId(request.identityId, request.goalId)');
    expect(port).not.toContain('findByFolderId');
    expect(prisma).not.toContain('findByFolderId');
  });

  it('findByKeyResultId remains identity scoped while hierarchy lookup is retired', () => {
    expect(port).toContain('findByKeyResultId(identityId: string, keyResultId: string): Promise<TaskPlan[]>;');
    expect(prisma).toContain('async findByKeyResultId(identityId: string, keyResultId: string)');
    expect(prisma).toMatch(/identityId,\s*keyResultId,\s*deletedAt: null/);
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
      'DELETE FROM task_templates WHERE identity_id = ? AND id IN (${placeholders})',
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
      "throw new Error('Task template not found for the current identity.');",
    );
    expect(powersync).toContain(
      'UPDATE task_templates SET deleted_at = ?, updated_at = ? WHERE id = ? AND identity_id = ?',
    );
    expect(powersync).toContain(
      'UPDATE task_templates SET deleted_at = NULL, archived_at = NULL, updated_at = ? WHERE id = ? AND identity_id = ?',
    );
  });

  it('port findByIdWithChildren requires identityId (residual 163)', () => {
    expect(port).toContain(
      'findByIdWithChildren(identityId: string, id: string): Promise<TaskPlan | null>;',
    );
    expect(port).not.toContain('findByIdWithChildrenForIdentity');
    expect(port).not.toContain('findByIdWithChildren(id: string)');
  });

  it('prisma/powersync findByIdWithChildren filter by identity (residual 163)', () => {
    expect(prisma).toContain('async findByIdWithChildren(identityId: string, id: string)');
    expect(prisma).toContain('where: { id, identityId }');
    expect(prisma).not.toContain('findByIdWithChildrenForIdentity');
    expect(powersync).toContain('async findByIdWithChildren(identityId: string, id: string)');
    expect(powersync).toContain('findByIdForIdentity(identityId, id)');
    expect(powersync).toContain(
      'SELECT * FROM task_instances WHERE template_id = ? AND identity_id = ? ORDER BY instance_date DESC',
    );
  });

  it('get use case loads withChildren via identity-scoped method (residual 163)', () => {
    const getUseCase = readFileSync(
      resolve(__dirname, '../../../../application/use-cases/queries/get-task-plan.use-case.ts'),
      'utf8',
    );
    expect(getUseCase).toContain('findByIdWithChildren(identityId, id)');
    expect(getUseCase).not.toContain('findByIdWithChildrenForIdentity');
  });
});
