/**
 * Nightly-only Web acceptance.
 *
 * Ordinary PR Web Flow is retired in Issue #625. These five supplemental
 * browser audits remain nightly-only; Provider and visual acceptance have
 * separate explicit execution contracts.
 */
export const WEB_AUDIT_SPECS = Object.freeze([
  'account/account-management.spec.ts',
  'account/account-profile.spec.ts',
  'performance/ai-workspace-performance.spec.ts',
  'setting/setting-appearance.spec.ts',
  'ux/command-palette.spec.ts',
]);
