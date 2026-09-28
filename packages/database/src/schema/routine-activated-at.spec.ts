import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(__dirname, '../../prisma/schema/reminder.prisma'), 'utf8');
const migration = readFileSync(
  resolve(__dirname, '../../prisma/migrations/add-routine-activated-at.sql'),
  'utf8',
);

describe('Routine durable activation boundary persistence', () => {
  it('keeps activatedAt as nullable RoutineDefinition-owned state', () => {
    const model = schema.slice(
      schema.indexOf('model RoutineDefinition {'),
      schema.indexOf('model RoutinePreference {'),
    );
    expect(model).toContain('activatedAt DateTime? @map("activated_at")');
  });

  it('ships an additive migration with a safe enabled-row backfill', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ');
    expect(migration).toContain('SET activated_at = created_at');
    expect(migration).toContain('WHERE enabled = TRUE');
    expect(migration).not.toContain('DROP COLUMN');
  });
});
