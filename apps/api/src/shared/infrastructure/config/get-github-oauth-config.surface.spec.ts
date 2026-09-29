/**
 * Residual 1333: e2e lane identity OAuth stays on e2e-mock even when real
 * GITHUB_OAUTH_* credentials are loaded from gitignored .env.test.local for
 * App / live-github wiring. Knowledge-repo App config is a separate path.
 *
 * Residual 1338: Windows host-dev real provider requires BOTH client id and
 * secret; client-id-only must not enable interactive OAuth (null config).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getGithubOAuthConfig e2e-mock keep-boundary (residual 1333)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('forces e2e-mock on RUNTIME_LANE=e2e even when real OAuth client id is set', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('RUNTIME_LANE', 'e2e');
    vi.stubEnv('GITHUB_OAUTH_CLIENT_ID', 'Iv23li-real-client-id');
    vi.stubEnv('GITHUB_OAUTH_CLIENT_SECRET', 'real-client-secret');
    vi.stubEnv('JWT_SECRET', 'test-jwt-secret-not-for-production-min-32');
    vi.stubEnv('DATABASE_URL', 'postgresql://test_user:test_pass@127.0.0.1:5433/memoflow_test');

    const { getGithubOAuthConfig } = await import('./env.js');
    const config = getGithubOAuthConfig();
    expect(config).toEqual({
      clientId: 'e2e-mock',
      clientSecret: 'e2e-mock-secret',
    });
  });

  it('does not force e2e-mock outside RUNTIME_LANE=e2e when real OAuth is configured', async () => {
    // Leave NODE_ENV as test so schema loads, but set a non-e2e runtime lane.
    // dotenv may still inject gitignored local client ids; assert only that we
    // do not replace them with the e2e mock when lane is not e2e.
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('RUNTIME_LANE', 'host-dev');
    vi.stubEnv('GITHUB_OAUTH_CLIENT_ID', 'Iv23li-real-client-id');
    vi.stubEnv('GITHUB_OAUTH_CLIENT_SECRET', 'real-client-secret');
    vi.stubEnv(
      'GITHUB_OAUTH_REDIRECT_URI',
      'https://gcp-dev-01.example.ts.net:20201/api/auth/callback/github',
    );
    vi.stubEnv('JWT_SECRET', 'test-jwt-secret-not-for-production-min-32');
    vi.stubEnv('DATABASE_URL', 'postgresql://test_user:test_pass@127.0.0.1:5433/memoflow_test');

    const { getGithubOAuthConfig } = await import('./env.js');
    const config = getGithubOAuthConfig();
    expect(config).not.toBeNull();
    expect(config?.clientId).not.toBe('e2e-mock');
    expect(config?.clientId).toBeTruthy();
    expect(config?.clientSecret).toBeTruthy();
    expect(config?.redirectURI).toBe(
      'https://gcp-dev-01.example.ts.net:20201/api/auth/callback/github',
    );
  });

  it('returns null on host-dev when only client id is set (residual 1338)', async () => {
    // Mirrors Windows residual 1338: .env.development.local had CLIENT_ID without SECRET.
    // Development lane must not fall back to e2e-mock or pretend OAuth is configured.
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RUNTIME_LANE', 'host-dev');
    vi.stubEnv('GITHUB_OAUTH_CLIENT_ID', 'Ov23liqWJN5nrlZqgfBV');
    vi.stubEnv('GITHUB_OAUTH_CLIENT_SECRET', '');
    vi.stubEnv('JWT_SECRET', 'test-jwt-secret-not-for-production-min-32');
    vi.stubEnv('DATABASE_URL', 'postgresql://test_user:test_pass@127.0.0.1:5433/memoflow_test');

    const { getGithubOAuthConfig } = await import('./env.js');
    const config = getGithubOAuthConfig();
    expect(config).toBeNull();
  });
});
