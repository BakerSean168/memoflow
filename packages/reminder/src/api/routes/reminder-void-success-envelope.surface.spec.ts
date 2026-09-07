import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Reminder void-success envelope surface:
 * delete commands use z.null()/ok(null); retired smart-frequency suggestion
 * rejection must not be reintroduced as another void command.
 */
describe('reminder void success envelope surface', () => {
  const templateRoutes = readFileSync(resolve(__dirname, './reminder-template.routes.ts'), 'utf8');
  const groupRoutes = readFileSync(resolve(__dirname, './reminder-group.routes.ts'), 'utf8');
  const controller = readFileSync(
    resolve(__dirname, '../../server/transport/reminder.controller.ts'),
    'utf8',
  );
  const electron = readFileSync(resolve(__dirname, '../../electron/index.ts'), 'utf8');
  const responseSchemas = readFileSync(
    resolve(__dirname, '../../../../contracts/src/modules/reminder/api/response-schemas.ts'),
    'utf8',
  );
  const adjustUseCase = readFileSync(
    resolve(
      __dirname,
      '../../server/application/use-cases/commands/adjust-reminder-frequency.use-case.ts',
    ),
    'utf8',
  );

  it('OpenAPI void deletes use z.null() and suggestion reject route stays retired', () => {
    expect(templateRoutes).toContain("successResponse(z.null(), '删除成功')");
    expect(groupRoutes).toContain("successResponse(z.null(), '删除成功')");
    expect(templateRoutes).not.toContain('frequency-adjustment/reject');
  });

  it('FrequencyAdjustmentResultSchema has no success boolean dual-track', () => {
    const blockMatch = responseSchemas.match(
      /export const FrequencyAdjustmentResultSchema = z\.object\(\{[\s\S]*?\}\);/,
    );
    expect(blockMatch).toBeTruthy();
    expect(blockMatch![0]).not.toContain('success: z.boolean()');
    expect(adjustUseCase).not.toContain('success: true');
    expect(adjustUseCase).not.toContain('success: boolean');
  });

  it('controllers return ok(null) only for the remaining void delete surfaces', () => {
    expect(controller).toMatch(/async deleteTemplate[\s\S]*?Promise<Result<null>>/);
    expect(controller).toMatch(/async deleteGroup[\s\S]*?Promise<Result<null>>/);
    expect(controller).not.toContain('rejectFrequencyAdjustment');
    expect((controller.match(/return ok\(null\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('Desktop IPC void delete handlers normalize to ok(null)', () => {
    expect(electron).toContain('ReminderChannels.TEMPLATE_DELETE');
    expect(electron).toContain('ReminderChannels.GROUP_DELETE');
    expect((electron.match(/return ok\(null\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
