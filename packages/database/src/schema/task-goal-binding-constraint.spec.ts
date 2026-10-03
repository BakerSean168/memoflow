import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  TASK_GOAL_BINDING_CONSTRAINT,
  TASK_GOAL_BINDING_CONSTRAINT_VERSION,
  describeTaskGoalBindingConstraintReport,
  ensureTaskGoalBindingConstraint,
} from './task-goal-binding-constraint';

describe('ensureTaskGoalBindingConstraint', () => {
  it('ships a migration matching the runtime invariant and explicit suggestion column', () => {
    const migration = readFileSync(new URL('../../prisma/migrations/task-goal-progress-rule.sql', import.meta.url), 'utf8');
    const source = readFileSync(new URL('./task-goal-binding-constraint.ts', import.meta.url), 'utf8');
    const check = source.slice(source.indexOf('  CHECK ('), source.indexOf('\n`;', source.indexOf('  CHECK (')));
    expect(migration).toContain(check);
    expect(migration).toContain('goal_progress_mode TEXT');
    expect(migration).toContain('goal_suggested_value DOUBLE PRECISION');
    expect(migration).toContain(TASK_GOAL_BINDING_CONSTRAINT_VERSION);
  });

  it('derives operator messages from the canonical version constant', () => {
    expect(
      describeTaskGoalBindingConstraintReport({
        tablePresent: true,
        constraintCreated: false,
        constraintReplaced: true,
      }),
    ).toBe(
      `Task goal-binding constraint: replaced with canonical ${TASK_GOAL_BINDING_CONSTRAINT_VERSION}`,
    );
    expect(
      describeTaskGoalBindingConstraintReport({
        tablePresent: false,
        constraintCreated: false,
        constraintReplaced: false,
      }),
    ).toBe('Task templates table is not present; constraint setup skipped.');
  });

  it('adds the v4 binding check when task_plans exists without the constraint', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ regclass: 'task_plans' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValue({ rows: [], rowCount: null });

    await expect(ensureTaskGoalBindingConstraint({ query })).resolves.toEqual({
      tablePresent: true,
      constraintCreated: true,
      constraintReplaced: false,
    });

    const sql = query.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toContain(`ADD CONSTRAINT "${TASK_GOAL_BINDING_CONSTRAINT}"`);
    expect(sql).toContain("goal_progress_trigger IN ('EachCompletion', 'PlanCompletion')");
    expect(sql).toContain('key_result_id IS NULL OR goal_id IS NOT NULL');
    expect(sql).toContain('goal_record_value IS NULL AND goal_progress_trigger IS NULL');
    expect(sql).toContain("goal_progress_mode = 'Prompt' AND goal_record_value IS NULL");
    expect(sql).toContain(') IS TRUE)');
    expect(sql).toContain('goal_record_value <> 0');
    expect(sql).toContain("'NaN'::float8");
    expect(sql).toContain(`IS '${TASK_GOAL_BINDING_CONSTRAINT_VERSION}'`);
  });

  it('replaces the v2 KR-required constraint and keeps reconciliation atomic', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ regclass: 'task_plans' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            definition:
              "CHECK (goal_id IS NOT NULL AND key_result_id IS NOT NULL AND goal_progress_trigger IN ('EachCompletion', 'PlanCompletion'))",
            comment: 'memoflow.task-goal-binding/v2',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValue({ rows: [], rowCount: null });

    await expect(ensureTaskGoalBindingConstraint({ query })).resolves.toEqual({
      tablePresent: true,
      constraintCreated: false,
      constraintReplaced: true,
    });

    const statements = query.mock.calls.map(([statement]) => String(statement));
    expect(statements).toContain('BEGIN');
    expect(
      statements.some((sql) => sql.includes(`DROP CONSTRAINT "${TASK_GOAL_BINDING_CONSTRAINT}"`)),
    ).toBe(true);
    expect(
      statements.some((sql) => sql.includes('key_result_id IS NULL OR goal_id IS NOT NULL')),
    ).toBe(true);
    expect(
      statements.some((sql) => sql.includes("WHEN 'PER_INSTANCE' THEN 'EachCompletion'")),
    ).toBe(true);
    expect(statements).toContain('COMMIT');
  });

  it('keeps an already-versioned canonical constraint unchanged', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ regclass: 'task_plans' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            definition: "CHECK (goal_progress_trigger IN ('EachCompletion', 'PlanCompletion') AND goal_progress_mode IN ('Fixed', 'Prompt') AND goal_suggested_value IS NULL) IS TRUE",
            comment: TASK_GOAL_BINDING_CONSTRAINT_VERSION,
          },
        ],
        rowCount: 1,
      });

    await expect(ensureTaskGoalBindingConstraint({ query })).resolves.toEqual({
      tablePresent: true,
      constraintCreated: false,
      constraintReplaced: false,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the table is absent', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ regclass: null }], rowCount: 1 });

    await expect(ensureTaskGoalBindingConstraint({ query })).resolves.toEqual({
      tablePresent: false,
      constraintCreated: false,
      constraintReplaced: false,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
