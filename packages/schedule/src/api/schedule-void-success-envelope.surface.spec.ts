import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Calendar event delete still has a void-success envelope. Raw ScheduleTask
 * delete is no longer a product transport operation.
 */
describe('schedule void success envelope surface', () => {
  const taskRoutes = readFileSync(resolve(__dirname, './routes.ts'), 'utf8');
  const eventRoutes = readFileSync(resolve(__dirname, './schedule-event.routes.ts'), 'utf8');
  const taskController = readFileSync(
    resolve(__dirname, '../server/transport/schedule.controller.ts'),
    'utf8',
  );
  const eventController = readFileSync(
    resolve(__dirname, '../server/transport/schedule-event.controller.ts'),
    'utf8',
  );
  const electron = readFileSync(resolve(__dirname, '../electron/index.ts'), 'utf8');

  it('keeps calendar event delete z.null() and removes raw worker delete route', () => {
    expect(eventRoutes).toContain("successResponse(z.null(), '删除成功')");
    expect(taskRoutes).not.toContain("successResponse(z.null(), '删除成功')");
    expect(taskRoutes).not.toContain("method: 'delete'");
  });

  it('keeps event controller void delete and removes raw worker delete controller method', () => {
    expect(eventController).toMatch(/async delete[\s\S]*?Promise<Result<null>>/);
    expect(eventController).toContain('return ok(null)');
    expect(taskController).not.toMatch(/async deleteTask\b/);
    expect(taskController).not.toContain('return ok(null)');
  });

  it('Desktop calendar delete remains while raw worker delete stays internal', () => {
    expect(electron).toContain('ScheduleChannels.DELETE');
    expect(electron).not.toContain('ipcMain.handle(ScheduleChannels.TASK_DELETE');
    expect((electron.match(/return ok\(null\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
