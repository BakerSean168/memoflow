import { describe, expect, it } from 'vitest';
import { DESKTOP_UPDATE_SERVICE_KEY } from '../keys';

describe('DesktopUpdateService host-neutral DI surface', () => {
  it('exports one optional host-neutral service key', () => {
    expect(typeof DESKTOP_UPDATE_SERVICE_KEY).toBe('symbol');
  });
});
