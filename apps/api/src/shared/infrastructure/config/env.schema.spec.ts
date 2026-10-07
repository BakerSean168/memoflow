import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema';

describe('envSchema LOCAL_VALIDATION', () => {
  const required = {
    JWT_SECRET: 'local-validation-secret-at-least-32-characters',
    AI_PROVIDER_ENCRYPTION_KEY: 'provider-encryption-secret-at-least-32-chars',
  };

  it('keeps local validation controls disabled by default', () => {
    expect(envSchema.parse(required).LOCAL_VALIDATION).toBe(false);
  });

  it('enables local validation controls only for the explicit 1 value', () => {
    expect(envSchema.parse({ ...required, LOCAL_VALIDATION: '1' }).LOCAL_VALIDATION).toBe(true);
    expect(envSchema.parse({ ...required, LOCAL_VALIDATION: '0' }).LOCAL_VALIDATION).toBe(false);
  });

  it('fails production preflight before serving Provider settings when the encryption key is missing', () => {
    expect(() =>
      envSchema.parse({
        JWT_SECRET: 'local-validation-secret-at-least-32-characters',
        NODE_ENV: 'production',
        AUTH_BASE_URL: 'https://api.example.com/api/auth',
        MEMOFLOW_WEB_URL: 'https://app.example.com',
      }),
    ).toThrow(/AI_PROVIDER_ENCRYPTION_KEY is required in production/);
  });

  it('requires explicit HTTPS auth origins in production', () => {
    expect(() =>
      envSchema.parse({
        ...required,
        NODE_ENV: 'production',
        AUTH_BASE_URL: 'http://auth.example.com/api/auth',
        MEMOFLOW_WEB_URL: 'https://app.example.com',
      }),
    ).toThrow(/AUTH_BASE_URL must use HTTPS/);
    expect(() =>
      envSchema.parse({
        ...required,
        NODE_ENV: 'production',
        AUTH_BASE_URL: 'https://api.example.com/api/auth',
      }),
    ).toThrow(/MEMOFLOW_WEB_URL is required/);
  });

  it('allows loopback HTTP only in the explicit local validation lane', () => {
    expect(
      envSchema.parse({
        ...required,
        NODE_ENV: 'production',
        LOCAL_VALIDATION: '1',
        AUTH_BASE_URL: 'http://localhost:12136/api/auth',
        MEMOFLOW_WEB_URL: 'http://127.0.0.1:12137',
      }),
    ).toMatchObject({ LOCAL_VALIDATION: true });
    expect(() =>
      envSchema.parse({
        ...required,
        NODE_ENV: 'production',
        LOCAL_VALIDATION: '1',
        AUTH_BASE_URL: 'http://api.example.com/api/auth',
        MEMOFLOW_WEB_URL: 'http://app.example.com',
      }),
    ).toThrow(/must use HTTPS/);
  });
});

describe('envSchema GitHub installation routing', () => {
  const required = {
    JWT_SECRET: 'local-validation-secret-at-least-32-characters',
    AI_PROVIDER_ENCRYPTION_KEY: 'provider-encryption-secret-at-least-32-chars',
  };

  it('accepts bounded lowercase environment route keys', () => {
    expect(
      envSchema.parse({
        ...required,
        GITHUB_INSTALLATION_ROUTE_KEY: 'staging-1',
        GITHUB_INSTALLATION_ROUTE_TARGETS:
          'dev=https://api.example.test,prod=https://api.example.com',
      }),
    ).toMatchObject({ GITHUB_INSTALLATION_ROUTE_KEY: 'staging-1' });
  });

  it.each(['Staging', 'staging/one', '-staging', 'staging-', 'staging_one'])(
    'rejects unsafe route key %s',
    (routeKey) => {
      expect(() =>
        envSchema.parse({ ...required, GITHUB_INSTALLATION_ROUTE_KEY: routeKey }),
      ).toThrow();
    },
  );
});

describe('envSchema remote origins require HTTPS', () => {
  const required = {
    JWT_SECRET: 'local-validation-secret-at-least-32-characters',
    AI_PROVIDER_ENCRYPTION_KEY: 'provider-encryption-secret-at-least-32-chars',
  };

  it('rejects MagicDNS HTTP in production without LOCAL_VALIDATION', () => {
    expect(() =>
      envSchema.parse({
        ...required,
        NODE_ENV: 'production',
        AUTH_BASE_URL: 'http://oracle.taile92a8e.ts.net:53080/api/auth',
        MEMOFLOW_WEB_URL: 'https://app.example.com',
      }),
    ).toThrow(/AUTH_BASE_URL must use HTTPS/);
  });

  it('rejects loopback HTTP in production without LOCAL_VALIDATION', () => {
    expect(() =>
      envSchema.parse({
        ...required,
        NODE_ENV: 'production',
        AUTH_BASE_URL: 'http://localhost:12136/api/auth',
        MEMOFLOW_WEB_URL: 'http://127.0.0.1:12137',
      }),
    ).toThrow(/AUTH_BASE_URL must use HTTPS/);
    expect(() =>
      envSchema.parse({
        ...required,
        NODE_ENV: 'production',
        AUTH_BASE_URL: 'https://api.example.com/api/auth',
        MEMOFLOW_WEB_URL: 'http://[::1]:8080',
      }),
    ).toThrow(/MEMOFLOW_WEB_URL must use HTTPS/);
  });

  it('rejects MagicDNS HTTP even in the local validation lane', () => {
    expect(() =>
      envSchema.parse({
        ...required,
        NODE_ENV: 'production',
        LOCAL_VALIDATION: '1',
        AUTH_BASE_URL: 'http://oracle.taile92a8e.ts.net:53080/api/auth',
        MEMOFLOW_WEB_URL: 'http://memoflow.taile92a8e.ts.net:58080',
      }),
    ).toThrow(/must use HTTPS/);
  });

  it('still allows HTTPS MagicDNS origins in production with LOCAL_VALIDATION', () => {
    expect(
      envSchema.parse({
        ...required,
        NODE_ENV: 'production',
        LOCAL_VALIDATION: '1',
        AUTH_BASE_URL: 'https://oracle.taile92a8e.ts.net:53080/api/auth',
        MEMOFLOW_WEB_URL: 'https://app.example.com',
      }),
    ).toMatchObject({ LOCAL_VALIDATION: true });
  });

  it('still allows loopback HTTP in production with LOCAL_VALIDATION', () => {
    expect(
      envSchema.parse({
        ...required,
        NODE_ENV: 'production',
        LOCAL_VALIDATION: '1',
        AUTH_BASE_URL: 'http://127.0.0.1:8080/api/auth',
        MEMOFLOW_WEB_URL: 'http://localhost:12137',
      }),
    ).toMatchObject({ LOCAL_VALIDATION: true });
  });

  it('still rejects arbitrary public HTTP hosts in production with LOCAL_VALIDATION', () => {
    expect(() =>
      envSchema.parse({
        ...required,
        NODE_ENV: 'production',
        LOCAL_VALIDATION: '1',
        AUTH_BASE_URL: 'http://example.com/api/auth',
        MEMOFLOW_WEB_URL: 'http://app.example.com',
      }),
    ).toThrow(/must use HTTPS/);
  });

  it('rejects arbitrary MagicDNS suffix HTTP hosts with LOCAL_VALIDATION', () => {
    expect(() =>
      envSchema.parse({
        ...required,
        NODE_ENV: 'production',
        LOCAL_VALIDATION: '1',
        AUTH_BASE_URL: 'http://foo.example.ts.net:53080/api/auth',
        MEMOFLOW_WEB_URL: 'https://app.example.com',
      }),
    ).toThrow(/AUTH_BASE_URL must use HTTPS/);
  });
});

describe('envSchema AI Provider private endpoint allowlist', () => {
  const required = {
    JWT_SECRET: 'local-validation-secret-at-least-32-characters',
    AI_PROVIDER_ENCRYPTION_KEY: 'provider-encryption-secret-at-least-32-chars',
  };

  it('accepts comma-separated exact host:port entries', () => {
    expect(
      envSchema.parse({
        ...required,
        AI_PROVIDER_PRIVATE_ENDPOINT_ALLOWLIST: 'localhost:11434,10.0.0.5:8443,[fd00::1]:9443',
      }).AI_PROVIDER_PRIVATE_ENDPOINT_ALLOWLIST,
    ).toBe('localhost:11434,10.0.0.5:8443,[fd00::1]:9443');
  });

  it.each(['localhost', 'https://localhost:11434', 'localhost:11434/path'])(
    'rejects malformed allowlist entry %s',
    (value) => {
      expect(() =>
        envSchema.parse({ ...required, AI_PROVIDER_PRIVATE_ENDPOINT_ALLOWLIST: value }),
      ).toThrow(/exact host:port/);
    },
  );
});

describe('envSchema OpenTelemetry (Phase 6 opt-in)', () => {
  const required = {
    JWT_SECRET: 'local-validation-secret-at-least-32-characters',
    AI_PROVIDER_ENCRYPTION_KEY: 'provider-encryption-secret-at-least-32-chars',
  };

  it('keeps tracing disabled by default with no collector requirement', () => {
    expect(envSchema.parse(required).OTEL_TRACING_ENABLED).toBe('0');
  });

  it('fails fast when tracing is enabled without an OTLP endpoint', () => {
    expect(() =>
      envSchema.parse({
        ...required,
        OTEL_TRACING_ENABLED: '1',
        OTEL_SERVICE_NAME: 'memoflow-api',
      }),
    ).toThrow(/OTEL_EXPORTER_OTLP_ENDPOINT is required/);
  });

  it('fails fast when tracing is enabled without a service name', () => {
    expect(() =>
      envSchema.parse({
        ...required,
        OTEL_TRACING_ENABLED: '1',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318/v1/traces',
      }),
    ).toThrow(/OTEL_SERVICE_NAME is required/);
  });

  it('accepts a complete opt-in configuration', () => {
    expect(
      envSchema.parse({
        ...required,
        OTEL_TRACING_ENABLED: '1',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318/v1/traces',
        OTEL_SERVICE_NAME: 'memoflow-api',
      }),
    ).toMatchObject({
      OTEL_TRACING_ENABLED: '1',
      OTEL_SERVICE_NAME: 'memoflow-api',
    });
  });
});

describe('external agent production environment', () => {
  const required = { JWT_SECRET: 'fixture-secret-at-least-thirty-two-characters' };
  it('uses the default client allowlist for empty compose passthrough', () => {
    expect(envSchema.parse({ ...required, EAG_OAUTH_CLIENT_IDS: '' }).EAG_OAUTH_CLIENT_IDS).toEqual(
      envSchema.parse(required).EAG_OAUTH_CLIENT_IDS,
    );
  });
  it('trusts no proxy by default and only accepts one explicitly controlled hop', () => {
    expect(envSchema.parse(required).API_TRUST_PROXY_HOPS).toBe(0);
    expect(envSchema.parse({ ...required, API_TRUST_PROXY_HOPS: '1' }).API_TRUST_PROXY_HOPS).toBe(
      1,
    );
    expect(() => envSchema.parse({ ...required, API_TRUST_PROXY_HOPS: '2' })).toThrow();
  });
});
