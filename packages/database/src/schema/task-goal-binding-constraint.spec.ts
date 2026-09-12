import { describe, expect, it, vi } from 'vitest';
import {
  TASK_GOAL_BINDING_CONSTRAINT,
  TASK_GOAL_BINDING_CONSTRAINT_VERSION,
  describeTaskGoalBindingConstraintReport,
  ensureTaskGoalBindingConstraint,
} from './task-goal-binding-constraint';

describe('ensureTaskGoalBindingConstraint', () => {
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

  it('adds the v3 binding check when task_templates exists without the constraint', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ regclass: 'task_templates' }], rowCount: 1 })
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
    expect(sql).toContain('goal_id IS NOT NULL AND key_result_id IS NULL');
    expect(sql).toContain('goal_record_value IS NULL AND goal_progress_trigger IS NULL');
    expect(sql).toContain('goal_record_value > 0');
    expect(sql).toContain(`IS '${TASK_GOAL_BINDING_CONSTRAINT_VERSION}'`);
  });

  it('replaces the v2 KR-required constraint and keeps reconciliation atomic', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ regclass: 'task_templates' }], rowCount: 1 })
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
      statements.some((sql) => sql.includes('goal_id IS NOT NULL AND key_result_id IS NULL')),
    ).toBe(true);
    expect(
      statements.some((sql) => sql.includes("WHEN 'PER_INSTANCE' THEN 'EachCompletion'")),
    ).toBe(true);
    expect(statements).toContain('COMMIT');
  });

  it('keeps an already-versioned canonical constraint unchanged', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ regclass: 'task_templates' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            definition: "CHECK (goal_progress_trigger IN ('EachCompletion', 'PlanCompletion'))",
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
