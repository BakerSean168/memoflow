import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Scheduler task ownership surface (stage-6 residual 121):
 * get/update/delete/actions and identity-filtered lists must never authorize
 * by bare schedule task primary key alone.
 * Residual 180: bare findById is intentional runtime bootstrap only (residual 131).
 */
describe('schedule task ownership surface', () => {
  const port = readFileSync(
    resolve(__dirname, '../../../../domain/repositories/i-schedule-task-repository.ts'),
    'utf8',
  );
  const prisma = readFileSync(resolve(__dirname, '../schedule-task-prisma.repository.ts'), 'utf8');
  const powersync = readFileSync(
    resolve(__dirname, '../../powersync/schedule-task-powersync.repository.ts'),
    'utf8',
  );
  const sharedProjection = readFileSync(
    resolve(
      __dirname,
      '../../../../../../../schedule-orchestration/src/projectors/shared-projection.ts',
    ),
    'utf8',
  );
  const getUseCase = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/queries/get-schedule-task.use-case.ts'),
    'utf8',
  );
  const deleteUseCase = readFileSync(
    resolve(
      __dirname,
      '../../../../application/use-cases/commands/delete-schedule-task.use-case.ts',
    ),
    'utf8',
  );
  const routes = readFileSync(resolve(__dirname, '../../../../../api/routes.ts'), 'utf8');
  const electron = readFileSync(resolve(__dirname, '../../../../../electron/index.ts'), 'utf8');
  const module = readFileSync(resolve(__dirname, '../../../scheduler.module.ts'), 'utf8');

  it('port findByIdForIdentity and deleteById require identityId', () => {
    expect(port).toContain(
      'findByIdForIdentity(identityId: string, id: string): Promise<ScheduleTask | null>;',
    );
    expect(port).toContain('deleteById(identityId: string, id: string): Promise<void>;');
  });

  it('prisma filters by id + identityId', () => {
    expect(prisma).toContain('where: { id, identityId }');
    expect(prisma).toContain('deleteMany({');
    expect(prisma).toContain(
      "throw new Error('Schedule task not found for the current identity.');",
    );
  });

  it('get/delete use cases load via findByIdForIdentity', () => {
    expect(getUseCase).toContain('findByIdForIdentity(identityId, id)');
    expect(getUseCase).toMatch(/execute\(id: string, identityId: string\)/);
    expect(deleteUseCase).toContain('findByIdForIdentity(identityId, id)');
    expect(deleteUseCase).toContain('deleteById(identityId, id)');
  });

  it('module list by status/source passes identityId', () => {
    expect(module).toContain('listScheduleTasksByStatus.execute(');
    expect(module).toMatch(
      /listScheduleTasksByStatus\.execute\(\s*query\.status as ScheduleTaskStatus,\s*ctx\.identityId,/,
    );
    expect(module).toMatch(/listScheduleTasksBySource\.execute\([\s\S]*ctx\.identityId/);
  });

  it('product transports expose raw ScheduleTask diagnostics only', () => {
    expect(routes).toContain('controller.getTask(req.params!.id, ctx)');
    expect(routes).not.toContain('controller.deleteTask(');
    expect(routes).not.toContain('controller.pauseTask(');
    expect(routes).not.toContain("method: 'delete'");
    expect(electron).toMatch(
      /TASK_GET_BY_ID[\s\S]*controller\.getTask\(taskId, requestContext\)/,
    );
    expect(electron).not.toMatch(/ipcMain\.handle\(ScheduleChannels\.TASK_DELETE/);
    expect(electron).not.toMatch(/ipcMain\.handle\(ScheduleChannels\.TASK_PAUSE/);
    expect(electron).not.toMatch(/ipcMain\.handle\(ScheduleChannels\.TASK_CREATE/);
  });

  it('port deleteBatch requires identityId (residual 155)', () => {
    expect(port).toContain('deleteBatch(identityId: string, ids: string[]): Promise<void>;');
  });

  it('prisma/powersync deleteBatch filter by identity (residual 155)', () => {
    expect(prisma).toContain('async deleteBatch(identityId: string, ids: string[])');
    expect(prisma).toContain('identityId,');
    expect(powersync).toContain(
      'DELETE FROM schedule_tasks WHERE identity_id = ? AND id IN (${placeholders})',
    );
  });

  it('shared projection deleteBatch is identity-scoped (residual 155)', () => {
    expect(sharedProjection).toContain('deleteBatch(identityId, ids)');
    expect(sharedProjection).not.toContain('deleteBatch(existingTasks.map((task) => task.id))');
  });

  it('port list methods require identityId (residual 162)', () => {
    expect(port).toContain(
      'findBySourceModule(module: SourceModule, identityId: string): Promise<ScheduleTask[]>;',
    );
    expect(port).toContain(
      'findBySourceEntity(\n    module: SourceModule,\n    entityId: string,\n    identityId: string,\n  ): Promise<ScheduleTask[]>;',
    );
    expect(port).toContain(
      'findByStatus(status: ScheduleTaskStatus, identityId: string): Promise<ScheduleTask[]>;',
    );
    // System scheduler paths remain intentionally unscoped:
    expect(port).toContain('findEnabled(identityId?: string): Promise<ScheduleTask[]>;');
    expect(port).toContain('findDueTasksForExecution(beforeTime: Date, limit?: number)');
  });

  it('prisma/powersync list methods always filter identityId (residual 162)', () => {
    expect(prisma).toContain('async findBySourceModule(module: SourceModule, identityId: string)');
    expect(prisma).toContain('sourceModule: module,\n        identityId,');
    expect(prisma).toContain('sourceEntityId: entityId,\n        identityId,');
    expect(prisma).toContain('status: status,\n        identityId,');
    expect(powersync).toContain(
      'SELECT * FROM schedule_tasks WHERE source_module = ? AND identity_id = ? ORDER BY next_run_at ASC',
    );
    expect(powersync).toContain(
      'SELECT * FROM schedule_tasks WHERE source_module = ? AND source_entity_id = ? AND identity_id = ? ORDER BY next_run_at ASC',
    );
    expect(powersync).toContain(
      'SELECT * FROM schedule_tasks WHERE status = ? AND identity_id = ? ORDER BY next_run_at ASC',
    );
  });

  it('shared projection requires selection.identityId (residual 162/168)', () => {
    expect(sharedProjection).toContain('readonly identityId: string;');
    expect(sharedProjection).not.toContain('readonly identityId?: string;');
    expect(sharedProjection).toContain('const identityId = selection.identityId;');
  });

  it('query options require identityId (residual 165)', () => {
    expect(port).toContain('export interface IScheduleTaskQueryOptions {\n  identityId: string;');
    expect(port).not.toContain('identityId?: string;');
  });

  it('prisma/powersync query/count always filter identityId (residual 165)', () => {
    expect(prisma).toContain('identityId: options.identityId,');
    expect(prisma).not.toContain('if (options.identityId) where.identityId = options.identityId;');
    expect(powersync).toContain("const clauses: string[] = ['identity_id = ?']");
    expect(powersync).toContain('const params: unknown[] = [options.identityId]');
  });

  it('bare findById remains only for runtime bootstrap; auth paths use findByIdForIdentity (residual 180)', () => {
    // Dual method kept intentionally: system scheduler may load by id then re-own.
    expect(port).toContain('findById(id: string): Promise<ScheduleTask | null>;');
    expect(port).toContain(
      'findByIdForIdentity(identityId: string, id: string): Promise<ScheduleTask | null>;',
    );
    // Authorization-sensitive use cases never call bare findById:
    expect(getUseCase).toContain('findByIdForIdentity(identityId, id)');
    expect(getUseCase).not.toContain('.findById(id)');
    expect(deleteUseCase).toContain('findByIdForIdentity(identityId, id)');
    expect(deleteUseCase).not.toContain('.findById(id)');
  });
});
