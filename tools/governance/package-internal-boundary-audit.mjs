#!/usr/bin/env node
/**
 * Package-Internal Boundary Audit
 *
 * CLI wrapper around the shared read-only runner used by both repository
 * governance and the pinned GovernanceRuleBundle engineering adapter.
 */
import path from 'node:path';
import { runPackageInternalBoundaryAudit } from './lib/package-internal-boundary-runner.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');
const report = runPackageInternalBoundaryAudit(ROOT);

if (!report.passed) {
  console.error(
    `❌ Package-Internal Boundary Audit FAILED — ${report.violations.length} new violation(s):\n`,
  );
  for (const violation of report.violations) {
    console.error(`  ${violation.file}:${violation.line}: ${violation.message}`);
  }
  console.error('\nSee docs/standards/architecture.md for package-internal layering rules.');
  process.exitCode = 1;
} else {
  console.log(
    `✅ Package-Internal Boundary Audit passed (${report.auditedFiles} files audited, 0 known violation(s) tracked)`,
  );
}
