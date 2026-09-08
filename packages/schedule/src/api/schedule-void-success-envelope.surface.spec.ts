import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Calendar delete keeps its null success envelope; worker mutations are not Schedule transport. */
describe('schedule Calendar void-success envelope surface', () => {
  const operationsRoutes = readFileSync(resolve(__dirname, './routes.ts'), 'utf8');
  const eventRoutes = readFileSync(resolve(__dirname, './schedule-event.routes.ts'), 'utf8');
  const eventController = readFileSync(
    resolve(__dirname, '../server/transport/schedule-event.controller.ts'),
    'utf8',
  );
  const electron = readFileSync(resolve(__dirname, '../electron/index.ts'), 'utf8');

  it('keeps Calendar event delete z.null() while Schedule operations remain non-task routes', () => {
    expect(eventRoutes).toContain("successResponse(z.null(), '删除成功')");
    expect(operationsRoutes).not.toContain('/tasks');
    expect(operationsRoutes).not.toContain("method: 'delete'");
  });

  it('keeps Calendar event controller delete semantics', () => {
    expect(eventController).toMatch(/async delete[\s\S]*?Promise<Result<null>>/);
    expect(eventController).toContain('return ok(null)');
  });

  it('keeps Calendar DELETE IPC and no raw worker mutation channels', () => {
    expect(electron).toContain('ScheduleChannels.DELETE');
    expect(electron).not.toContain('ScheduleChannels.TASK_DELETE');
    expect(electron).not.toContain('ScheduleChannels.TASK_PAUSE');
    expect(electron).not.toContain('ScheduleChannels.TASK_CREATE');
  });
});
