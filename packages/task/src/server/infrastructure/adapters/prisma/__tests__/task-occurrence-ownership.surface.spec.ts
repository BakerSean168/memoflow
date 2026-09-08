import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Task instance ownership surface (stage-6 residual 124):
 * Residual 177 collapses bare findById dual method.
 * get/complete/skip/start/delete must never authorize by bare task instance
 * primary key alone.
 */
describe('task instance ownership surface', () => {
  const port = readFileSync(
    resolve(__dirname, '../../../../domain/repositories/i-task-occurrence-repository.ts'),
    'utf8',
  );
  const prisma = readFileSync(resolve(__dirname, '../task-occurrence-prisma.repository.ts'), 'utf8');
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
      '../../../../application/use-cases/queries/list-task-occurrences-by-template.use-case.ts',
    ),
    'utf8',
  );
  const getTemplate = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/queries/get-task-plan.use-case.ts'),
    'utf8',
  );
  const completeInstance = readFileSync(
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
  const pauseTemplate = readFileSync(
    resolve(
      __dirname,
      '../../../../application/use-cases/commands/pause-task-plan.use-case.ts',
    ),
    'utf8',
  );
  const deleteTemplate = readFileSync(
    resolve(
      __dirname,
      '../../../../application/use-cases/commands/delete-task-plan.use-case.ts',
    ),
    'utf8',
  );
  const listTemplates = readFileSync(
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

  it('findByTemplateId requires identityId (residual 133)', () => {
    expect(port).toContain(
      'findByTemplateId(templateId: string, identityId: string): Promise<TaskOccurrence[]>;',
    );
    expect(prisma).toContain('where: { templateId, identityId, deletedAt: null }');
    expect(listByTemplate).toContain('findByTemplateId(templateId, identityId)');
    expect(getTemplate).toContain('findByTemplateId(id, identityId)');
    expect(completeInstance).toContain('reevaluateTaskPlanOutcome(');
    expect(completeInstance).toContain('identityId');
    expect(outcomeReevaluation).toContain('findByTemplateId(templateId, identityId)');
    expect(projection).toContain('findByTemplateId(');
    expect(projection).toContain('String(templateDTO.identityId)');
  });

  it('template-scoped instance queries require identityId (residual 134)', () => {
    expect(port).toContain('deleteByTemplateId(templateId: string, identityId: string)');
    expect(port).toContain('getTemplateStats(');
    expect(port).toContain('identityId: string');
    expect(port).toContain('deleteIncompleteInstancesFrom(');
    expect(prisma).toContain('where: { templateId, identityId }');
    expect(prisma).toMatch(/getTemplateStats\([\s\S]*identityId/);
    expect(getTemplate).toContain('getTemplateStats([id], identityId)');
    expect(listTemplates).toContain('getTemplateStats(');
    expect(listTemplates).toContain('request.identityId');
    expect(pauseTemplate).toContain('deleteIncompleteInstancesFrom(');
    expect(pauseTemplate).toContain('identityId');
    expect(deleteTemplate).toContain('deleteByTemplateId(id, identityId)');
  });

  it('prisma filters by id + identityId', () => {
    expect(prisma).toContain('where: { id, identityId }');
    expect(prisma).toContain('deleteMany({');
    expect(prisma).toContain(
      "throw new Error('Task instance not found for the current identity.');",
    );
  });

  it('get/delete use cases load via findByIdForIdentity', () => {
    expect(getUseCase).toContain('findByIdForIdentity(identityId, id)');
    expect(getUseCase).toMatch(/execute\(\s*id: string,\s*identityId: string,/);
    expect(deleteUseCase).toContain('findByIdForIdentity(identityId, id)');
    expect(deleteUseCase).toContain('delete(identityId, id)');
  });

  it('module api wrappers pass identityId for instance mutations', () => {
    expect(module).toMatch(/completeTaskOccurrence:\s*\(id, identityId, input\)\s*=>/);
    expect(module).toMatch(/deleteTaskOccurrence:\s*\(id, identityId\)\s*=>/);
    expect(module).toMatch(/getTaskOccurrence:\s*\(id, identityId\)\s*=>/);
  });

  it('HTTP and Electron instance get/delete pass identity context (Phase 4)', () => {
    // Read/query routes keep expressAdapter with controller-side identity scope.
    expect(routes).toContain('controller.getInstance(req.params!.id, ctx)');

    // Phase 4: mutation routes bind contract invocation schemas through the
    // validation-aware registrar; the controller still receives the canonical
    // identity-bearing context.
    expect(routes).toContain('routeWithValidation');
    expect(routes).toMatch(/controller\.deleteInstance\(data\.params\.id, ctx\)/);
    expect(routes).toMatch(/controller\.completeInstance\(data\.params\.id, data\.body, ctx\)/);
    expect(electron).toContain('registerValidatedChannel');
    expect(electron).toMatch(
      /INSTANCE_GET[\s\S]*instanceController\.getInstance\([\s\S]*requestContext/,
    );
    expect(electron).toMatch(
      /INSTANCE_DELETE[\s\S]*instanceController\.deleteInstance\(data\.params\.id,[\s\S]*requestContext/,
    );
    expect(electron).not.toContain('instanceController.getInstance(payload?.id ?? payload),');
  });

  it('port deleteMany requires identityId (residual 157)', () => {
    expect(port).toContain('deleteMany(identityId: string, ids: string[]): Promise<void>;');
  });

  it('prisma/powersync deleteMany filter by identity (residual 157)', () => {
    expect(prisma).toContain('async deleteMany(identityId: string, ids: string[])');
    expect(prisma).toContain('where: { id: { in: ids }, identityId }');
    expect(powersync).toContain(
      'DELETE FROM task_instances WHERE identity_id = ? AND id IN (${placeholders})',
    );
  });
});
