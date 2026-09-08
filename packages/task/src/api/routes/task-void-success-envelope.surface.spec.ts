import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Task void-success envelope surface (stage-6 residual 90):
 * void deletes use z.null()/ok(null) —
 * no `{ success: boolean }` dual-track body / Result.void data:undefined.
 */
describe('task void success envelope surface', () => {
  const templateRoutes = readFileSync(resolve(__dirname, './task-plan.routes.ts'), 'utf8');
  const instanceRoutes = readFileSync(resolve(__dirname, './task-occurrence.routes.ts'), 'utf8');
  const templateController = readFileSync(
    resolve(__dirname, '../../server/transport/task-plan.controller.ts'),
    'utf8',
  );
  const instanceController = readFileSync(
    resolve(__dirname, '../../server/transport/task-occurrence.controller.ts'),
    'utf8',
  );
  const electron = readFileSync(resolve(__dirname, '../../electron/index.ts'), 'utf8');
  const deleteTemplateUseCase = readFileSync(
    resolve(
      __dirname,
      '../../server/application/use-cases/commands/delete-task-plan.use-case.ts',
    ),
    'utf8',
  );

  it('OpenAPI void deletes use z.null()', () => {
    expect(templateRoutes).toContain("successResponse(z.null(), '删除成功')");
    expect(instanceRoutes).toContain("successResponse(z.null(), '删除成功')");
  });

  it('use case / controllers return void then ok(null) for deletes', () => {
    expect(deleteTemplateUseCase).toContain('Promise<Result<void>>');
    expect(deleteTemplateUseCase).toContain('return ok(undefined)');
    expect(deleteTemplateUseCase).not.toContain('success: true');
    expect(templateController).toMatch(/async deleteTemplate[\s\S]*?Promise<Result<null>>/);
    expect(instanceController).toMatch(/async deleteInstance[\s\S]*?Promise<Result<null>>/);
    expect(templateController).toContain('return ok(null)');
    expect(instanceController).toContain('return ok(null)');
  });

  it('Desktop IPC void delete handlers normalize to ok(null)', () => {
    for (const channel of ['TEMPLATE_DELETE', 'INSTANCE_DELETE']) {
      expect(electron).toContain(`TaskChannels.${channel}`);
    }
    expect(electron.match(/return ok\(null\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
