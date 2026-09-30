import type { GoalRecordSchemaQueryClient } from './goal-record-source-correlation';

// Kept identical to the standalone SQL migration by the schema test.
export const GOAL_RECORD_AUTHORSHIP_MIGRATION_SQL = `-- Existing Task-correlated records predate user-entered Task measurements.
BEGIN;
ALTER TABLE "goal_records" ADD COLUMN IF NOT EXISTS "authorship" TEXT;
UPDATE "goal_records"
SET "authorship" = CASE
  WHEN "source_type" IS NULL AND "source_id" IS NULL THEN 'Manual'
  ELSE 'TaskAutomatic'
END
WHERE "authorship" IS NULL;
ALTER TABLE "goal_records"
  ALTER COLUMN "authorship" SET DEFAULT 'Manual',
  ALTER COLUMN "authorship" SET NOT NULL;
ALTER TABLE "goal_records" DROP CONSTRAINT IF EXISTS "goal_records_authorship_source_check";
ALTER TABLE "goal_records" ADD CONSTRAINT "goal_records_authorship_source_check" CHECK (
  ("authorship" = 'Manual' AND "source_type" IS NULL AND "source_id" IS NULL)
  OR
  ("authorship" = 'TaskAutomatic' AND "source_type" IS NOT NULL
    AND "source_type" IN ('TASK_INSTANCE', 'TASK_TEMPLATE')
    AND "source_id" IS NOT NULL AND length(btrim("source_id")) > 0)
  OR
  ("authorship" = 'TaskUserMeasurement' AND "source_type" IS NOT NULL
    AND "source_type" = 'TASK_INSTANCE'
    AND "source_id" IS NOT NULL AND length(btrim("source_id")) > 0)
);
COMMIT;
`;

export async function prepareGoalRecordAuthorship(client: GoalRecordSchemaQueryClient): Promise<boolean> {
  const table = await client.query("SELECT to_regclass('public.goal_records') AS regclass");
  if (!table.rows[0]?.regclass) return false;
  try {
    await client.query(GOAL_RECORD_AUTHORSHIP_MIGRATION_SQL);
  } catch (cause) {
    await client.query('ROLLBACK');
    throw cause;
  }
  return true;
}
