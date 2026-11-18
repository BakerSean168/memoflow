import { describe, expect, it } from 'vitest';
import { buildDesktopUserAgent } from '@memoflow/cloud-auth-contracts';
import { parseSessionUserAgent } from './session-device';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';

describe('parseSessionUserAgent', () => {
  it('recognizes the User-Agent the desktop writes', () => {
    expect(parseSessionUserAgent(buildDesktopUserAgent('0.23.0', 'Windows'))).toEqual({
      client: 'desktop',
      os: 'windows',
    });
  });

  it('treats the legacy bare node User-Agent as the desktop client', () => {
    expect(parseSessionUserAgent('node')).toEqual({ client: 'desktop', os: 'unknown' });
    expect(parseSessionUserAgent('node-fetch/1.0')).toEqual({
      client: 'desktop',
      os: 'unknown',
    });
  });

  it('maps browsers and platforms to display tokens', () => {
    expect(parseSessionUserAgent(CHROME_WINDOWS)).toEqual({ client: 'chrome', os: 'windows' });
    expect(parseSessionUserAgent(SAFARI_IPHONE)).toEqual({ client: 'safari', os: 'ios' });
    expect(
      parseSessionUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0',
      ),
    ).toEqual({ client: 'edge', os: 'windows' });
  });

  it('falls back instead of echoing unknown values', () => {
    expect(parseSessionUserAgent(null)).toEqual({ client: 'unknown', os: 'unknown' });
    expect(parseSessionUserAgent('')).toEqual({ client: 'unknown', os: 'unknown' });
    expect(parseSessionUserAgent('a custom HTTP client')).toEqual({
      client: 'unknown',
      os: 'unknown',
    });
  });
});
