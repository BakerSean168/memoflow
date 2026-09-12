export const TASK_GOAL_BINDING_CONSTRAINT = 'task_templates_goal_binding_complete';
export const TASK_GOAL_BINDING_CONSTRAINT_VERSION = 'memoflow.task-goal-binding/v3';

export interface TaskGoalBindingSchemaQueryClient {
  query(sql: string): Promise<{
    rows: Array<Record<string, unknown>>;
    rowCount: number | null;
  }>;
}

export interface TaskGoalBindingConstraintReport {
  tablePresent: boolean;
  constraintCreated: boolean;
  constraintReplaced: boolean;
}

const canonicalConstraintSql = `
  ALTER TABLE task_templates
  ADD CONSTRAINT "${TASK_GOAL_BINDING_CONSTRAINT}"
  CHECK (
    (
      goal_id IS NULL AND key_result_id IS NULL AND
      goal_record_value IS NULL AND goal_progress_trigger IS NULL
    ) OR (
      goal_id IS NOT NULL AND key_result_id IS NULL AND
      goal_record_value IS NULL AND goal_progress_trigger IS NULL
    ) OR (
      goal_id IS NOT NULL AND key_result_id IS NOT NULL AND (
        (goal_record_value IS NULL AND goal_progress_trigger IS NULL) OR (
          goal_record_value IS NOT NULL AND goal_record_value > 0 AND
          goal_progress_trigger IS NOT NULL AND
          goal_progress_trigger IN ('EachCompletion', 'PlanCompletion')
        )
      )
    )
  )
`;

const migrateLegacyTriggersSql = `
  UPDATE task_templates
  SET goal_progress_trigger = CASE goal_progress_trigger
    WHEN 'PER_INSTANCE' THEN 'EachCompletion'
    WHEN 'ALL_INSTANCES_COMPLETED' THEN 'PlanCompletion'
    ELSE goal_progress_trigger
  END
  WHERE goal_progress_trigger IN ('PER_INSTANCE', 'ALL_INSTANCES_COMPLETED')
`;

function isCanonicalConstraint(row: Record<string, unknown> | undefined): boolean {
  if (!row) return false;
  const definition = String(row.definition ?? '');
  return (
    row.comment === TASK_GOAL_BINDING_CONSTRAINT_VERSION &&
    definition.includes('EachCompletion') &&
    definition.includes('PlanCompletion') &&
    !definition.includes('PER_INSTANCE') &&
    !definition.includes('ALL_INSTANCES_COMPLETED')
  );
}

async function installCanonicalConstraint(
  client: TaskGoalBindingSchemaQueryClient,
  replaceExisting: boolean,
): Promise<void> {
  await client.query('BEGIN');
  try {
    if (replaceExisting) {
      await client.query(
        `ALTER TABLE task_templates DROP CONSTRAINT "${TASK_GOAL_BINDING_CONSTRAINT}"`,
      );
    }
    await client.query(migrateLegacyTriggersSql);
    await client.query(canonicalConstraintSql);
    await client.query(`
      COMMENT ON CONSTRAINT "${TASK_GOAL_BINDING_CONSTRAINT}" ON task_templates
      IS '${TASK_GOAL_BINDING_CONSTRAINT_VERSION}'
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

/**
 * Reconciles the Task -> Goal binding database invariant with the current vNext contract.
 *
 * Valid persisted states are:
 * - no binding at all;
 * - a Goal-level link with no Key Result and no automatic contribution;
 * - a Goal/KR link with no automatic contribution;
 * - a Goal/KR link with a positive EachCompletion/PlanCompletion contribution.
 *
 * Older trigger names are data-migrated before the v3 constraint is installed.
 */
export async function ensureTaskGoalBindingConstraint(
  client: TaskGoalBindingSchemaQueryClient,
): Promise<TaskGoalBindingConstraintReport> {
  const tableResult = await client.query(`SELECT to_regclass('public.task_templates') AS regclass`);
  if (!tableResult.rows[0]?.regclass) {
    return { tablePresent: false, constraintCreated: false, constraintReplaced: false };
  }

  const constraintResult = await client.query(`
    SELECT
      pg_get_constraintdef(oid) AS definition,
      obj_description(oid, 'pg_constraint') AS comment
    FROM pg_constraint
    WHERE conname = '${TASK_GOAL_BINDING_CONSTRAINT}'
      AND conrelid = 'public.task_templates'::regclass
  `);
  const existing = constraintResult.rows[0];
  if (isCanonicalConstraint(existing)) {
    return { tablePresent: true, constraintCreated: false, constraintReplaced: false };
  }

  await installCanonicalConstraint(client, Boolean(existing));
  return {
    tablePresent: true,
    constraintCreated: !existing,
    constraintReplaced: Boolean(existing),
  };
}
