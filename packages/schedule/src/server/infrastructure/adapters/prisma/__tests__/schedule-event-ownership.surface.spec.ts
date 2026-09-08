import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Schedule event ownership surface (stage-6 residual 122/170):
 * calendar get/update/delete and conflict get/resolve must never authorize
 * by bare schedule primary key alone. Residual 170 collapses dual findById.
 */
describe('schedule event ownership surface', () => {
  const port = readFileSync(
    resolve(__dirname, '../../../../domain/repositories/i-schedule-repository.ts'),
    'utf8',
  );
  const prisma = readFileSync(resolve(__dirname, '../schedule-prisma.repository.ts'), 'utf8');
  const powersync = readFileSync(
    resolve(__dirname, '../../powersync/schedule-powersync.repository.ts'),
    'utf8',
  );
  const service = readFileSync(
    resolve(
      __dirname,
      '../../../../application/services/schedule-event-application-service.ts',
    ),
    'utf8',
  );
  const conflictDetection = readFileSync(
    resolve(
      __dirname,
      '../../../../application/services/schedule-conflict-detection-service.ts',
    ),
    'utf8',
  );
  const conflictResolution = readFileSync(
    resolve(
      __dirname,
      '../../../../application/services/schedule-conflict-resolution-service.ts',
    ),
    'utf8',
  );
  const controller = readFileSync(
    resolve(__dirname, '../../../../transport/schedule-event.controller.ts'),
    'utf8',
  );
  const routes = readFileSync(
    resolve(__dirname, '../../../../../api/schedule-event.routes.ts'),
    'utf8',
  );
  const electron = readFileSync(resolve(__dirname, '../../../../../electron/index.ts'), 'utf8');
  const module = readFileSync(resolve(__dirname, '../../../schedule.module.ts'), 'utf8');

  it('port findByIdForIdentity and deleteById require identityId', () => {
    expect(port).toContain(
      'findByIdForIdentity(identityId: string, id: string): Promise<CalendarEntry | null>;',
    );
    expect(port).toContain('deleteById(identityId: string, id: string');
  });

  it('port drops bare findById dual method (residual 170)', () => {
    expect(port).not.toContain('findById(id: string): Promise<CalendarEntry | null>;');
    expect(prisma).not.toMatch(/async findById\(id: string\)/);
    expect(powersync).not.toMatch(/async findById\(id: string\)/);
  });

  it('prisma filters by id + identityId', () => {
    expect(prisma).toContain('where: { id, identityId }');
    expect(prisma).toContain('deleteMany({');
    expect(prisma).toContain('toResultErrorException');
  });

  it('application services load via findByIdForIdentity', () => {
    expect(service).toContain('findByIdForIdentity(identityId, id)');
    expect(service).toMatch(/getSchedule\(id: string, identityId: string\)/);
    expect(service).toMatch(/deleteSchedule\(id: string, identityId: string/);
    expect(conflictDetection).toContain('findByIdForIdentity(');
    expect(conflictDetection).toMatch(
      /getScheduleConflicts\(\s*scheduleId: string,\s*identityId: string,/,
    );
    expect(conflictResolution).toMatch(
      /resolveConflict\(\s*scheduleId: string,\s*request: ResolveConflictRequest,\s*identityId: string,/,
    );
  });

  it('module eventApi passes ctx.identityId into get/update/delete/conflicts', () => {
    expect(module).toContain('getSchedule(id, ctx.identityId)');
    expect(module).toContain('deleteSchedule(id, ctx.identityId');
    expect(module).toContain('getConflicts(id, ctx.identityId)');
    expect(module).toContain('resolveConflict(id, data, ctx.identityId)');
    expect(module).toMatch(/updateSchedule\(\s*id,\s*ctx\.identityId,/);
  });

  it('HTTP and Electron event get/update/delete pass identity context', () => {
    expect(controller).toContain('async get(id: string, ctx: Context)');
    expect(controller).toContain('async update(id: string, input: unknown, ctx: Context)');
    expect(controller).toContain('async delete(id: string, input: unknown, ctx: Context');
    expect(controller).toContain('async getConflicts(id: string, ctx: Context)');
    expect(controller).toContain(
      'async resolveConflict(id: string, input: unknown, ctx: Context)',
    );
    expect(routes).toContain('controller.get(req.params!.id, ctx)');
    expect(routes).toContain('controller.update(req.params!.id, req.body, ctx)');
    expect(routes).toContain('controller.delete(req.params!.id, req.body, ctx)');
    expect(routes).toContain('controller.getConflicts(req.params!.id, ctx)');
    expect(routes).toContain('controller.resolveConflict(req.params!.id, req.body, ctx)');
    expect(electron).toMatch(
      /ScheduleChannels\.GET[\s\S]*controller\.get\(id, requestContext\)/,
    );
    expect(electron).toMatch(
      /ScheduleChannels\.UPDATE[\s\S]*controller\.update\(id, dto, requestContext\)/,
    );
    expect(electron).toMatch(
      /ScheduleChannels\.DELETE[\s\S]*controller\.delete\(id, payload, requestContext\)/,
    );
    expect(electron).not.toContain('ipcMain.handle(ScheduleChannels.GET, (_event, id) => controller.get(id));');
  });
});
