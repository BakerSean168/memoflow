import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RendererEventChannels } from './ipc-channels';

/**
 * Renderer event channel surface (stage-6 residual 71):
 * notification:clicked is a contracts RendererEventChannels entry — no dual-track string.
 */
describe('RendererEventChannels surface', () => {
  const source = readFileSync(resolve(__dirname, 'ipc-channels.ts'), 'utf8');

  it('includes NOTIFICATION_CLICKED on the contracts map', () => {
    expect(source).toContain("NOTIFICATION_CLICKED: 'notification:clicked'");
    expect(RendererEventChannels.NOTIFICATION_CLICKED).toBe('notification:clicked');
    expect(Object.values(RendererEventChannels)).toContain('notification:clicked');
  });
});
