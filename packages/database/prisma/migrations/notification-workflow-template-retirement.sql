-- N4-2401B / ADR-085: workflow definitions replace the legacy template aggregate.
-- ADR-111 permits direct destructive cutover because MemoFlow has no production legacy data to preserve.
DROP TABLE IF EXISTS "notification_templates";
