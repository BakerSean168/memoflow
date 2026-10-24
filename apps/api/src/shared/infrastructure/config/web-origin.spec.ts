import { describe, expect, it } from 'vitest';
import {
  deriveWebOrigin,
  getTrustedWebOrigins,
  shouldDisableCrossOriginOpenerPolicyForLocalValidation,
} from './web-origin.js';

/**
 * O2V-01: the MagicDNS public Web origin is auto-included in the API trusted
 * origins (server.ts trustedOrigins) and the API CORS middleware (global.ts)
 * WITHOUT touching the getCorsOrigins() keep-boundary (residual 1189).
 */

describe('deriveWebOrigin', () => {
  it('strips the trailing path from a MagicDNS Web URL', () => {
    expect(deriveWebOrigin('http://oracle.taile92a8e.ts.net:58080/auth/verify')).toBe(
      'http://oracle.taile92a8e.ts.net:58080',
    );
  });

  it('keeps an already-origin URL unchanged', () => {
    expect(deriveWebOrigin('https://app.example.com')).toBe('https://app.example.com');
  });

  it('returns undefined when MEMOFLOW_WEB_URL is unset', () => {
    expect(deriveWebOrigin(undefined)).toBeUndefined();
    expect(deriveWebOrigin('')).toBeUndefined();
  });

  it('returns undefined for an unparseable URL', () => {
    expect(deriveWebOrigin('not a url')).toBeUndefined();
  });
});

describe('shouldDisableCrossOriginOpenerPolicyForLocalValidation', () => {
  it('disables inert COOP for controlled non-loopback HTTP validation origins', () => {
    expect(
      shouldDisableCrossOriginOpenerPolicyForLocalValidation(
        'http://gcp-dev-01.taile92a8e.ts.net:53080/api/auth',
        true,
      ),
    ).toBe(true);
  });

  it('preserves Helmet COOP for HTTPS validation origins', () => {
    expect(
      shouldDisableCrossOriginOpenerPolicyForLocalValidation(
        'https://gcp-dev-01.taile92a8e.ts.net/api/auth',
        true,
      ),
    ).toBe(false);
  });

  it('preserves Helmet COOP for potentially trustworthy loopback HTTP', () => {
    expect(
      shouldDisableCrossOriginOpenerPolicyForLocalValidation(
        'http://127.0.0.1:53080/api/auth',
        true,
      ),
    ).toBe(false);
    expect(
      shouldDisableCrossOriginOpenerPolicyForLocalValidation(
        'http://localhost:53080/api/auth',
        true,
      ),
    ).toBe(false);
  });

  it('never relaxes COOP outside LOCAL_VALIDATION', () => {
    expect(
      shouldDisableCrossOriginOpenerPolicyForLocalValidation(
        'http://gcp-dev-01.taile92a8e.ts.net:53080/api/auth',
        false,
      ),
    ).toBe(false);
  });
});

describe('getTrustedWebOrigins', () => {
  it('appends the MEMOFLOW_WEB_URL-derived origin to the CORS list', () => {
    expect(
      getTrustedWebOrigins(
        ['http://localhost:58080', 'http://127.0.0.1:58080'],
        'http://oracle.taile92a8e.ts.net:58080',
      ),
    ).toEqual([
      'http://localhost:58080',
      'http://127.0.0.1:58080',
      'http://oracle.taile92a8e.ts.net:58080',
    ]);
  });

  it('dedupes an origin already present in the CORS list', () => {
    expect(
      getTrustedWebOrigins(
        ['http://localhost:58080', 'http://oracle.taile92a8e.ts.net:58080'],
        'http://oracle.taile92a8e.ts.net:58080/',
      ),
    ).toEqual(['http://localhost:58080', 'http://oracle.taile92a8e.ts.net:58080']);
  });

  it('returns the CORS list unchanged when MEMOFLOW_WEB_URL is unset', () => {
    const base = ['http://localhost:58080', 'http://127.0.0.1:58080'];
    expect(getTrustedWebOrigins(base, undefined)).toEqual(base);
  });

  it('does not mutate the input list', () => {
    const base = ['http://localhost:58080'];
    const result = getTrustedWebOrigins(base, 'http://oracle.taile92a8e.ts.net:58080');
    expect(result).not.toBe(base);
    expect(base).toEqual(['http://localhost:58080']);
  });

  it('ignores an invalid MEMOFLOW_WEB_URL', () => {
    const base = ['http://localhost:58080'];
    expect(getTrustedWebOrigins(base, 'not a url')).toEqual(base);
  });
});

