-- Durable activation boundary for scheduler-owned Routine Elapsed triggers.
ALTER TABLE routine_definitions
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Existing enabled routines historically used definition creation/update state as
-- the implicit activation boundary. Preserve a stable boundary from now on.
UPDATE routine_definitions
SET activated_at = created_at
WHERE enabled = TRUE
  AND activated_at IS NULL;

UPDATE routine_definitions
SET activated_at = NULL
WHERE enabled = FALSE
  AND activated_at IS NOT NULL;
