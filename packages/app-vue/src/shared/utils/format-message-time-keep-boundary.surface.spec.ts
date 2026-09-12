import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** TIME-1206: message timestamps share the Product Time facade across React and Vue. */
describe('message time Product Time convergence', () => {
  const dir = __dirname;
  const react = readFileSync(
    resolve(dir, '../../../../app-react/src/hooks/useAIWorkspace.ts'),
    'utf8',
  );
  const vue = readFileSync(
    resolve(dir, '../../modules/notification/views/SSEMonitorPage.vue'),
    'utf8',
  );

  it('formats app-react AI messages through Product Time', () => {
    expect(react).toContain("import { getProductTime } from '../utils/product-time'");
    expect(react).toMatch(/function formatMessageTime\b/);
    expect(react).toContain('getProductTime().format.hm(timestamp)');
    expect(react).not.toContain("Intl.DateTimeFormat('zh-CN'");
    expect(react).not.toContain('toLocaleTimeString');
  });

  it('formats app-vue SSE messages through the same Product Time contract', () => {
    expect(vue).toContain('getProductTime');
    expect(vue).toMatch(/function formatMessageTime\b/);
    expect(vue).toContain('getProductTime().format.hm(timestamp)');
    expect(vue).not.toContain('toLocaleTimeString(locale.value)');
    expect(vue).not.toContain("Intl.DateTimeFormat('zh-CN'");
  });

  it('keeps presentation timezone/locale ownership out of feature-local message formatters', () => {
    for (const source of [react, vue]) {
      const body = source.match(/function formatMessageTime\([\s\S]*?\n\}/)?.[0] ?? '';
      expect(body).toContain('getProductTime().format.hm');
      expect(body).not.toContain('new Date(');
      expect(body).not.toContain('Intl.DateTimeFormat');
      expect(body).not.toContain('toLocaleTimeString');
    }
  });
});
