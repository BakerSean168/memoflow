import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1075: password toast-only keep-boundary.
 * These paths translate Result errors and toast without store.setError / without
 * createComposableHandleError (setError + report dual shape).
 * W6-C: password mutations additionally write a structured receipt through the
 * dedicated store action `setPasswordMutationError` (never the generic setError
 * nor the handleError sole), keeping the toast path while making the failure
 * survive page reloads.
 * Soft residual 1055: useSession/useAccount use the shared handleError toast cluster.
 * Soft residual 1065: goal createGoalErrorHandler rich-log keep-boundary remains.
 * Does not flip §13.2 checkboxes.
 */
describe('password toast-only keep-boundary (residual 1075)', () => {
  const authDir = __dirname;
  const password = readFileSync(resolve(authDir, 'usePassword.ts'), 'utf8');
  const handleErrorSole = readFileSync(
    resolve(authDir, '../../../shared/utils/create-composable-handle-error.ts'),
    'utf8',
  );

  it('usePassword owns Residual 1075 toast-only path without handleError sole', () => {
    expect(password).toContain('Residual 1075 keep-boundary');
    expect(password).toContain('getPasswordErrorMessage');
    expect(password).toContain('translateResultError');
    expect(password).toContain('toast.error');
    expect(password).toContain("scope: 'auth'");
    // No store.setError call dual and no handleError sole import/call
    // (comments may name keep-boundary contrast symbols)
    expect(password).not.toMatch(/store\.setError\s*\(/);
    expect(password).not.toMatch(/from ['"].*create-composable-handle-error['"]/);
    expect(password).not.toMatch(/createComposableHandleError\s*\(/);
  });

  it('password mutations persist a structured receipt through the dedicated store action (W6-C)', () => {
    expect(password).toContain('buildPasswordMutationErrorReceipt');
    expect(password).toContain('store.setPasswordMutationError(');
    expect(password).toContain('store.clearPasswordMutationError()');
    expect(password).toMatch(/store\.setPasswordMutationError\s*\(/);
    // The structured receipt path must never fall back to the generic setError.
    expect(password).not.toMatch(/store\.setError\s*\(/);
  });

  it('differs from createComposableHandleError sole shape (no force-merge)', () => {
    expect(handleErrorSole).toMatch(/export function createComposableHandleError\b/);
    expect(handleErrorSole).toContain('Soft residual 1075');
    expect(handleErrorSole).toContain('setError');
    expect(handleErrorSole).toContain('report');
    // Sole always setError+report; toast-only paths intentionally skip setError
    expect(handleErrorSole).not.toMatch(/export function getPasswordErrorMessage\b/);
  });

  it('documents residual 1075 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(
      resolve(authDir, 'password-toast-only-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1075');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
