-- S4-2302B / ADR-083: destructive legacy Scheduler retirement.
-- ScheduledInvocation + InvocationAttempt are the sole Temporal Engine runtime truth.
-- Legacy worker rows are intentionally not migrated; environments must reset/reseed
-- or complete the S4-2302A convergence before applying this destructive cutover.
DROP TABLE IF EXISTS "schedule_executions" CASCADE;
DROP TABLE IF EXISTS "schedule_statistics" CASCADE;
DROP TABLE IF EXISTS "schedule_tasks" CASCADE;
