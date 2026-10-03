BEGIN;
ALTER TABLE task_plans ADD COLUMN IF NOT EXISTS goal_progress_mode TEXT;
ALTER TABLE task_plans ADD COLUMN IF NOT EXISTS goal_suggested_value DOUBLE PRECISION;
ALTER TABLE task_plans DROP CONSTRAINT IF EXISTS task_plans_goal_binding_complete;
UPDATE task_plans
SET goal_progress_trigger = CASE goal_progress_trigger
  WHEN 'PER_INSTANCE' THEN 'EachCompletion'
  WHEN 'ALL_INSTANCES_COMPLETED' THEN 'PlanCompletion'
  ELSE goal_progress_trigger
END
WHERE goal_progress_trigger IN ('PER_INSTANCE', 'ALL_INSTANCES_COMPLETED');
ALTER TABLE task_plans ADD CONSTRAINT task_plans_goal_binding_complete
  CHECK ((
    (goal_progress_mode IS NULL AND goal_suggested_value IS NULL AND
     goal_record_value IS NULL AND goal_progress_trigger IS NULL AND
     (key_result_id IS NULL OR goal_id IS NOT NULL))
    OR (goal_id IS NOT NULL AND key_result_id IS NOT NULL AND (
      ((goal_progress_mode IS NULL OR goal_progress_mode = 'Fixed') AND
       goal_suggested_value IS NULL AND goal_record_value IS NOT NULL AND
       goal_record_value <> 0 AND
       goal_record_value NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8) AND
       goal_progress_trigger IS NOT NULL AND
       goal_progress_trigger IN ('EachCompletion', 'PlanCompletion'))
      OR (goal_progress_mode = 'Prompt' AND goal_record_value IS NULL AND
          goal_progress_trigger IS NOT NULL AND goal_progress_trigger = 'EachCompletion' AND
          (goal_suggested_value IS NULL OR
           goal_suggested_value NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)))
    ))
  ) IS TRUE);
COMMENT ON CONSTRAINT task_plans_goal_binding_complete ON task_plans IS 'memoflow.task-goal-binding/v4';
COMMIT;
