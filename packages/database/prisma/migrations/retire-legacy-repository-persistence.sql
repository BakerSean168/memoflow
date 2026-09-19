-- CLEAN-2601 / ADR-111: destructive retirement of the pre-Knowledge repository aggregate.
-- No legacy repository data is migrated or preserved; reset/reseed is the rollback policy.
DROP TABLE IF EXISTS "resource_references" CASCADE;
DROP TABLE IF EXISTS "linked_contents" CASCADE;
DROP TABLE IF EXISTS "repository_resources" CASCADE;
DROP TABLE IF EXISTS "resources" CASCADE;
DROP TABLE IF EXISTS "folders" CASCADE;
DROP TABLE IF EXISTS "repository_explorers" CASCADE;
DROP TABLE IF EXISTS "repository_statistics" CASCADE;
DROP TABLE IF EXISTS "repositories" CASCADE;
