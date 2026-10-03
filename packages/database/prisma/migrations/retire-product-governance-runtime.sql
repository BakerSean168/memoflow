-- PVC-GOV-7903 / ADR-113: destructive retirement of the synthetic Product Governance runtime.
-- Engineering Governance is repository-native and does not depend on these tables.
DROP TABLE IF EXISTS "rule_revisions" CASCADE;
DROP TABLE IF EXISTS "rules" CASCADE;
