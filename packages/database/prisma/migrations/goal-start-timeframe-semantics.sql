ALTER TABLE goals ADD COLUMN IF NOT EXISTS start_kind TEXT;

-- Existing Goal start_date values were exact Ymd values. Preserve their
-- semantics by marking them as day-precision starts.
UPDATE goals
SET start_kind = 'day'
WHERE start_date IS NOT NULL
  AND start_kind IS NULL;
