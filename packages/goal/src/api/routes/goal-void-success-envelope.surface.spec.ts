import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('goal mutation success envelope surface', () => {
  const reviewRoutes = readFileSync(resolve(__dirname, './review.routes.ts'), 'utf8');
  const recordRoutes = readFileSync(resolve(__dirname, './goal-record.routes.ts'), 'utf8');
  const electron = readFileSync(resolve(__dirname, '../../electron/index.ts'), 'utf8');
  const responseSchemas = readFileSync(
    resolve(__dirname, '../../../../contracts/src/modules/goal/api/response-schemas.ts'),
    'utf8',
  );

  it('uses GoalMutationReceipt for review/record deletes', () => {
    expect(reviewRoutes).toContain("successResponse(GoalMutationReceiptSchema, '删除成功')");
    expect(recordRoutes).toContain("successResponse(GoalMutationReceiptSchema, '删除成功')");
    expect(responseSchemas).not.toContain('DeleteSuccessResSchema');
  });

  it('desktop keeps the same mutation channels without retired folder delete normalization', () => {
    for (const channel of ['KEY_RESULT_DELETE', 'REVIEW_DELETE', 'RECORD_DELETE']) {
      expect(electron).toContain(`GoalChannels.${channel}`);
    }
    expect(electron).not.toContain('GoalChannels.FOLDER_DELETE');
    expect(electron).not.toContain('return ok(null)');
  });
});
