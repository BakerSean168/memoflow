import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 265: contracts notification no longer dual-aliases AssetImageKey = string.
 * Desktop icons use string here; branded AssetImageKey lives in @memoflow/assets only.
 */
describe('notification AssetImageKey dual single-track surface', () => {
  const dispatch = readFileSync(resolve(__dirname, 'notification-dispatch-events.ts'), 'utf8');
  const protocolIndex = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

  it('does not define AssetImageKey identity dual in contracts', () => {
    expect(dispatch).not.toMatch(/export type AssetImageKey\s*=/);
    expect(dispatch).not.toContain('AssetImageKey');
    expect(protocolIndex).not.toContain('AssetImageKey');
  });

  it('desktop dispatch icon field is string | null', () => {
    expect(dispatch).toMatch(/icon\?:\s*string\s*\|\s*null/);
  });
});
