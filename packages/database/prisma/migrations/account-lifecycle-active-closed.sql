-- ACC-1404: Account product lifecycle converges to Active | Closed.
-- This migration only touches the accounts table; Repository/Knowledge status
-- values named Suspended/Deleted are unrelated and intentionally unchanged.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'deleted_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'closed_at'
  ) THEN
    ALTER TABLE "accounts" RENAME COLUMN "deleted_at" TO "closed_at";
  END IF;
END $$;

UPDATE "accounts" SET "status" = 'Active' WHERE "status" = 'ACTIVE';
UPDATE "accounts"
SET "status" = 'Closed'
WHERE "status" IN (
  'Deactivated', 'DEACTIVATED',
  'Suspended', 'SUSPENDED',
  'Inactive', 'INACTIVE',
  'Deleted', 'DELETED'
);

ALTER TABLE "accounts" ALTER COLUMN "status" SET DEFAULT 'Active';
