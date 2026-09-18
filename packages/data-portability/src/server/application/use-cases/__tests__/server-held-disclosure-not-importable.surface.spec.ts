import { describe, expect, it } from 'vitest';
import {
  parsePortableBackupEnvelopeV3,
  ServerHeldDataDisclosureEnvelopeV1Schema,
} from '@memoflow/contracts/data-portability';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('server-held disclosure V3 import boundary', () => {
  it('rejects disclosure envelopes before V3 capability validation', () => {
    const parsed = parsePortableBackupEnvelopeV3({
      kind: 'memoflow.server-held-data-disclosure',
      schemaVersion: 1,
    });
    expect(parsed).toEqual({
      ok: false,
      error: expect.stringContaining('not importable'),
    });
  });

  it('rejects legacy business backups without retaining a legacy parser', () => {
    const parsed = parsePortableBackupEnvelopeV3({
      kind: 'memoflow.user-data-export',
      schemaVersion: 2,
      data: {},
    });
    expect(parsed).toEqual({
      ok: false,
      error: expect.stringContaining('only V3 is supported'),
    });
  });

  it('keeps the disclosure contract explicitly non-importable', () => {
    const source = readFileSync(
      resolve(__dirname, '../export-server-held-data-disclosure.use-case.ts'),
      'utf8',
    );
    expect(source).toContain("kind: 'memoflow.server-held-data-disclosure'");
    expect(source).toContain("importMode: 'not-importable'");
    expect(source).toContain('includesImportableBusinessDataBackup: false');
    expect(ServerHeldDataDisclosureEnvelopeV1Schema.safeParse({}).success).toBe(false);
  });
});
