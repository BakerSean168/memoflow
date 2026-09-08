import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Schedule execution ownership surface (stage-6 residual 144):
 * execution reads must never authorize by bare execution/task primary key alone.
 * Residual 179 collapses bare findById dual method.
 */
describe('schedule execution ownership surface', () => {
  const port = readFileSync(
    resolve(__dirname, '../../../../domain/repositories/i-schedule-execution-repository.ts'),
    'utf8',
  );
  const prisma = readFileSync(
    resolve(__dirname, '../schedule-execution-prisma.repository.ts'),
    'utf8',
  );
  const powersync = readFileSync(
    resolve(__dirname, '../../powersync/schedule-execution-powersync.repository.ts'),
    'utf8',
  );

  it('port findByIdForIdentity and findByTaskId require identityId (residual 144)', () => {
    expect(port).toContain(
      'findByIdForIdentity(identityId: string, id: string): Promise<ScheduleExecution | null>;',
    );
    expect(port).toContain(
      'findByTaskId(identityId: string, taskId: string): Promise<ScheduleExecution[]>;',
    );
  });

  it('port drops bare findById dual method (residual 179)', () => {
    expect(port).not.toContain('findById(id: string): Promise<ScheduleExecution | null>;');
    expect(prisma).not.toMatch(/async findById\(id: string\)/);
    expect(powersync).not.toMatch(/async findById\(id: string\)/);
  });

  it('prisma filters by identityId', () => {
    expect(prisma).toContain('async findByIdForIdentity(identityId: string, id: string)');
    expect(prisma).toContain('where: { id, identityId }');
    expect(prisma).toContain('async findByTaskId(identityId: string, taskId: string)');
    expect(prisma).toContain('where: { identityId, taskId }');
  });

  it('powersync filters by identity_id', () => {
    expect(powersync).toContain(
      'SELECT * FROM schedule_executions WHERE id = ? AND identity_id = ? LIMIT 1',
    );
    expect(powersync).toContain(
      'SELECT * FROM schedule_executions WHERE identity_id = ? AND task_id = ? ORDER BY execution_time DESC',
    );
  });
});
