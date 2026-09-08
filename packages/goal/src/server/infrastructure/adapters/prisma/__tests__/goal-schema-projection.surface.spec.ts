/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(
  resolve(__dirname, '../../../../../../../database/prisma/schema/goal.prisma'),
  'utf8',
);
const powerSyncSchema = readFileSync(
  resolve(__dirname, '../../../../../../../powersync-schema/src/index.ts'),
  'utf8',
);

describe('Goal schema projection ownership', () => {
  it('keeps retired GoalFolder/Focus persistence absent', () => {
    expect(schema).not.toMatch(/model (GoalFolder|FocusMode|FocusSession)\b/);
    expect(powerSyncSchema).not.toMatch(/goal_folders|focus_modes|focus_sessions/);
  });

  it('removes the unused aggregate statistics cache instead of syncing stale copies', () => {
    expect(schema).not.toMatch(/model GoalStatistic\b|@@map\("goal_statistics"\)/);
    expect(powerSyncSchema).not.toMatch(/goal_statistics/);
  });

  it('keeps concurrency and soft deletion exclusively on the Goal aggregate root', () => {
    const goalModel = schema.match(/model Goal \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(goalModel).toMatch(/version\s+Int/);
    expect(goalModel).toMatch(/deletedAt\s+DateTime\?/);

    for (const modelName of ['KeyResult', 'GoalRecord', 'GoalReview']) {
      const model = schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
      expect(model).not.toMatch(/\bversion\s+/);
      expect(model).not.toMatch(/\bdeletedAt\s+/);
    }

    for (const tableName of ['key_results', 'goal_records', 'goal_reviews']) {
      const table =
        powerSyncSchema.match(
          new RegExp(`const ${tableName} = new Table\\(\\{[\\s\\S]*?\\n\\}\\);`),
        )?.[0] ?? '';
      expect(table).not.toMatch(/\bversion:/);
      expect(table).not.toMatch(/\bdeleted_at:/);
    }
  });

  it('enforces tenant ownership through aggregate composite foreign keys', () => {
    expect(schema).toContain(
      '@relation("GoalKeyResults", fields: [goalId, identityId], references: [id, identityId]',
    );
    expect(schema).toContain(
      'KeyResult @relation(fields: [keyResultId, identityId], references: [id, identityId]',
    );
    expect(schema).toContain(
      'Goal @relation(fields: [goalId, identityId], references: [id, identityId]',
    );
    expect(schema).toContain(
      'KeyResult @relation(fields: [keyResultId, goalId, identityId], references: [id, goalId, identityId]',
    );
  });
});
