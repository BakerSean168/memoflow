import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * UserFilesSettings surface (stage-6 residual 69):
 * Desktop system user-files IPC returns Result ok/fail; settings UI unwraps via isOk.
 */
describe('UserFilesSettings Result surface', () => {
  const source = readFileSync(resolve(__dirname, 'UserFilesSettings.vue'), 'utf8');

  it('unwraps system user-files IPC Result envelopes', () => {
    expect(source).toContain("import { isOk, type Result } from '@memoflow/contracts/result'");
    expect(source).toContain('isOk(response)');
    expect(source).toContain('SystemChannels.USER_FILES_GET_PATH');
    expect(source).toContain('SystemChannels.USER_FILES_PICK_DIRECTORY');
    expect(source).not.toMatch(/\) as UserFilesPathResult;/);
  });

  it('uses shared Settings presentation primitives without raw success palette classes', () => {
    expect(source).toContain('<SettingsSection');
    expect(source).toContain('<SettingsPropertyRow');
    expect(source).toContain('<SettingsStatusBlock');
    expect(source).not.toContain('<Card');
    expect(source).not.toMatch(/green-\d+/);
  });
});
