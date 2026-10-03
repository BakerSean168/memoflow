/** Explicit read-only engineering runner allowlist for the native CLI and parity tests. */
import { runPackageInternalBoundaryAudit } from './package-internal-boundary-runner.mjs';

const ENGINEERING_RUNNERS = new Map([
  [
    'package-internal-boundary',
    {
      checkScript: 'tools/governance/package-internal-boundary-audit.mjs',
      run: (root) => runPackageInternalBoundaryAudit(root),
    },
  ],
]);

export function executeEngineeringCheck(root, adapter) {
  const registered = ENGINEERING_RUNNERS.get(adapter.adapterId);
  if (!registered) {
    throw new Error(`No explicit engineering runner registered for ${adapter.adapterId}`);
  }
  if (registered.checkScript !== adapter.checkScript) {
    throw new Error(
      `Engineering runner metadata mismatch for ${adapter.adapterId}: expected ${registered.checkScript}`,
    );
  }
  const result = registered.run(root);
  return {
    status: result.passed ? 'passed' : 'failed',
    exitCode: result.passed ? 0 : 1,
    stdout: result.passed ? `audited ${result.auditedFiles} files` : '',
    stderr: result.passed ? '' : JSON.stringify(result.violations),
  };
}
