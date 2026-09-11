-- KNOW-2001 / ADR-089 / ADR-111 destructive cutover.
--
-- The previous `knowledge_repository_connections` table mixed durable binding,
-- provider health, remote-history safety, and projection cursor/failure state.
-- MemoFlow has no legacy business data that must survive this vNext cutover.
--
-- This file is an explicit/manual destructive helper, matching the repository's
-- existing flat-SQL convention. Production schema convergence remains owned by
-- `prisma db push --accept-data-loss`; after these rebuildable tables are
-- dropped, Prisma recreates them from the canonical schema with `binding_id`
-- ownership plus the four-axis tables:
--   knowledge_spaces
--   knowledge_remote_bindings
--   remote_repository_observations
--   remote_history_fences
--   knowledge_projection_checkpoints
--
-- Do not add rename/backfill/dual-read compatibility here. Rollback is source
-- rollback plus database reset/reseed, per ADR-111.

DROP TABLE IF EXISTS "knowledge_write_requests";
DROP TABLE IF EXISTS "knowledge_attachment_content_cache";
DROP TABLE IF EXISTS "knowledge_attachment_projections";
DROP TABLE IF EXISTS "knowledge_note_projections";
DROP TABLE IF EXISTS "github_webhook_deliveries";
DROP TABLE IF EXISTS "knowledge_repository_connections";
