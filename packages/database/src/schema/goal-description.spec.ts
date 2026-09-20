import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(__dirname, '../../prisma/schema/goal.prisma'), 'utf8');
const migration = readFileSync(
  resolve(__dirname, '../../prisma/migrations/add-goal-description.sql'),
  'utf8',
);

describe('Goal description persistence', () => {
  it('keeps description as a nullable Goal-owned column', () => {
    const goalModel = schema.slice(
      schema.indexOf('model Goal {'),
      schema.indexOf('model KeyResult {'),
    );
    expect(goalModel).toContain('description         String?');
  });

  it('ships a non-destructive migration for existing databases', () => {
    expect(migration).toContain('ALTER TABLE "goals"');
    expect(migration).toContain('ADD COLUMN "description" TEXT');
    expect(migration).not.toContain('DROP COLUMN');
  });
});
