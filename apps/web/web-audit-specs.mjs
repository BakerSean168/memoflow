/**
 * Nightly-only Web acceptance.
 *
 * Required PR/main Web Flow already owns Goal/Task/Schedule CRUD, notifications,
 * auth, AI workflows, Notes, Routine, and shell responsiveness. This audit keeps
 * only supplemental current-owner coverage rather than maintaining duplicate
 * tests for retired product surfaces.
 */
export const WEB_AUDIT_SPECS = Object.freeze([
  'account/account-management.spec.ts',
  'account/account-profile.spec.ts',
  'performance/ai-workspace-performance.spec.ts',
  'setting/setting-appearance.spec.ts',
  'ux/command-palette.spec.ts',
]);
