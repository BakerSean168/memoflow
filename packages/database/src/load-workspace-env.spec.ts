import { afterEach, describe, expect, it } from 'vitest';

import { loadWorkspaceEnv } from './load-workspace-env';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (typeof value === 'undefined') {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
}

afterEach(() => {
  restoreEnv();
});

describe('loadWorkspaceEnv', () => {
  it('normalizes postgres localhost URLs to 127.0.0.1 after loading env files', () => {
    process.env.DATABASE_URL = 'postgresql://memoflow:secret@localhost:5432/memoflow?schema=public';
    process.env.DIRECT_URL = 'postgres://memoflow@localhost:5432/memoflow';
    process.env.SHADOW_DATABASE_URL = 'postgresql://memoflow@localhost:5432/memoflow_shadow';

    loadWorkspaceEnv('test');

    expect(process.env.DATABASE_URL).toContain('@127.0.0.1:5432/');
    expect(process.env.DIRECT_URL).toContain('@127.0.0.1:5432/');
    expect(process.env.SHADOW_DATABASE_URL).toContain('@127.0.0.1:5432/');
  });

  it('keeps non-postgres URLs and unparsable values unchanged', () => {
    process.env.DATABASE_URL = 'mysql://memoflow@localhost:3306/memoflow';
    process.env.DIRECT_URL = 'not a url';
    process.env.SHADOW_DATABASE_URL = 'postgresql://memoflow@db.internal:5432/memoflow_shadow';

    loadWorkspaceEnv('test');

    expect(process.env.DATABASE_URL).toBe('mysql://memoflow@localhost:3306/memoflow');
    expect(process.env.DIRECT_URL).toBe('not a url');
    expect(process.env.SHADOW_DATABASE_URL).toBe(
      'postgresql://memoflow@db.internal:5432/memoflow_shadow',
    );
  });

  it('preserves pre-existing env entries while still normalizing supported URLs', () => {
    process.env.MEMOFLOW_TEST_SENTINEL = 'keep-me';
    process.env.DATABASE_URL = 'postgresql://memoflow@localhost:5432/memoflow';

    loadWorkspaceEnv('production');

    expect(process.env.MEMOFLOW_TEST_SENTINEL).toBe('keep-me');
    expect(process.env.DATABASE_URL).toContain('@127.0.0.1:5432/');
  });
});
