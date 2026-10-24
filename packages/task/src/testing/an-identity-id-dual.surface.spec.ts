import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import { anIdentityId } from '@memoflow/test-utils/fixtures';

/**
 * Residual 1033: task anIdentityId dual retired onto test-utils fixtures sole.
 * Soft residual 1038: tip focused suite numbers track Residual 1038 evidence tip (309/1339).
 * Does not flip §13.2 checkboxes.
 */
describe('anIdentityId dual retired (residual 1033)', () => {
  const taskFixture = readFileSync(resolve(__dirname, 'task.fixture.ts'), 'utf8');
  const sole = readFileSync(
    resolve(__dirname, '../../../test-utils/src/fixtures/account.fixture.ts'),
    'utf8',
  );
  const testingBarrel = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

  it('owns sole anIdentityId helper body in test-utils fixtures', () => {
    expect(sole).toContain('Residual 1033');
    expect(sole).toMatch(/export function anIdentityId\b/);
    expect(sole).toContain('IdentityId.of(value)');
    expect(sole).toContain('IdentityId.generate()');
  });

  it('task testing fixture re-exports sole without local dual body', () => {
    expect(taskFixture).toContain('Residual 1033');
    expect(taskFixture).toContain("from '@memoflow/test-utils/fixtures'");
    expect(taskFixture).toContain('anIdentityId');
    expect(taskFixture).not.toMatch(/export function anIdentityId\b/);
    expect(taskFixture).not.toMatch(/function anIdentityId\b/);
  });

  it('task testing barrel re-exports fixture surface including anIdentityId path', () => {
    expect(testingBarrel).toContain("export * from './task.fixture'");
  });

  it('generates branded identity ids and accepts explicit values', () => {
    const generated = anIdentityId();
    expect(typeof generated).toBe('string');
    expect(String(generated).length).toBeGreaterThan(0);
    expect(String(generated)).toMatch(/^IdentityId_/);

    const fixed = anIdentityId('IdentityId_test-fixed-1');
    expect(String(fixed)).toBe('IdentityId_test-fixed-1');
    // branded type still assignable as IdentityId at compile-time via import
    const typed: IdentityId = fixed;
    expect(String(typed)).toBe('IdentityId_test-fixed-1');
  });
});
