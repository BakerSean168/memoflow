-- Run in a disposable PostgreSQL session. Only a temporary table is modified.
CREATE TEMP TABLE goal_records (id TEXT PRIMARY KEY, source_type TEXT, source_id TEXT);
INSERT INTO goal_records VALUES
  ('manual', NULL, NULL),
  ('occurrence', 'TASK_INSTANCE', 'occurrence-1'),
  ('plan', 'TASK_TEMPLATE', 'plan-1');
\ir ../../prisma/migrations/add-goal-record-authorship.sql
DO $$
BEGIN
  IF (SELECT authorship FROM goal_records WHERE id = 'manual') <> 'Manual'
    OR (SELECT authorship FROM goal_records WHERE id = 'occurrence') <> 'TaskAutomatic'
    OR (SELECT authorship FROM goal_records WHERE id = 'plan') <> 'TaskAutomatic' THEN
    RAISE EXCEPTION 'Legacy authorship backfill failed';
  END IF;
END $$;
INSERT INTO goal_records VALUES ('prompted', 'TASK_INSTANCE', 'prompted-1', 'TaskUserMeasurement');
INSERT INTO goal_records (id) VALUES ('default-manual');
DO $$
DECLARE
  a TEXT;
  t TEXT;
  s TEXT;
  valid BOOLEAN;
  accepted INTEGER := 0;
  rejected INTEGER := 0;
BEGIN
  FOREACH a IN ARRAY ARRAY['Manual', 'TaskAutomatic', 'TaskUserMeasurement', 'Unknown', NULL] LOOP
    FOREACH t IN ARRAY ARRAY[NULL, 'TASK_INSTANCE', 'TASK_TEMPLATE', 'Unknown'] LOOP
      FOREACH s IN ARRAY ARRAY[NULL, '', ' ', 'source-id'] LOOP
        valid := COALESCE(
          (a = 'Manual' AND t IS NULL AND s IS NULL)
          OR (a = 'TaskAutomatic' AND t IN ('TASK_INSTANCE', 'TASK_TEMPLATE') AND s = 'source-id')
          OR (a = 'TaskUserMeasurement' AND t = 'TASK_INSTANCE' AND s = 'source-id'), false);
        BEGIN
          INSERT INTO goal_records VALUES ('matrix', t, s, a);
          IF NOT valid THEN RAISE EXCEPTION 'Accepted invalid combination: %/%/%', a, t, s; END IF;
          accepted := accepted + 1;
          DELETE FROM goal_records WHERE id = 'matrix';
        EXCEPTION WHEN check_violation OR not_null_violation THEN
          IF valid THEN RAISE EXCEPTION 'Rejected valid combination: %/%/%', a, t, s; END IF;
          rejected := rejected + 1;
        END;
      END LOOP;
    END LOOP;
  END LOOP;
  IF accepted <> 4 OR rejected <> 76 THEN RAISE EXCEPTION 'Matrix count mismatch'; END IF;
  RAISE NOTICE 'Backfill/default valid; authorship/source matrix: 4 accepted, 76 rejected';
END $$;
-- Re-running must retain TaskUserMeasurement authorship.
\ir ../../prisma/migrations/add-goal-record-authorship.sql
DO $$
BEGIN
  IF (SELECT authorship FROM goal_records WHERE id = 'prompted') <> 'TaskUserMeasurement' THEN
    RAISE EXCEPTION 'Re-run overwrote prompted measurement';
  END IF;
END $$;
