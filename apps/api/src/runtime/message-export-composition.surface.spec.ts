import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Web export surface must know about messages so it can fail closed. The
 * capability is composed next to `ai-conversations` in the API server root
 * (#865 §2.5); a source-shape check is the cheapest guard against silent removal.
 */
describe('Web export message capability composition', () => {
  it('registers the export-only message capability beside ai-conversations', () => {
    const source = readFileSync(resolve(__dirname, '../server.ts'), 'utf8');
    expect(source).toContain("import { createAiMessageExportCapability } from '@memoflow/ai'");
    expect(source).toContain('aiComposed.portableCapability,');
    expect(source).toContain('createAiMessageExportCapability(prisma)');
  });
});
