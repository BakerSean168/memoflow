import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('live duration presentation boundaries', () => {
  it('keeps Task Intl duration and React calendar range contracts', () => {
    const task = readFileSync(
      resolve(__dirname, '../../modules/task/utils/format-task-duration.ts'),
      'utf8',
    );
    expect(task).toContain('Intl.NumberFormat');
    expect(task).toContain("unit: 'hour'");
    const react = readFileSync(
      resolve(__dirname, '../../../../app-react/src/screens/ScheduleEventEditorScreen.tsx'),
      'utf8',
    );
    expect(react).toContain('getProductTime');
    expect(react).toContain("kind: 'Timed'");
    expect(react).not.toMatch(/function buildDuration\b/);
    expect(react).not.toMatch(/\bduration:\s*buildDuration/);
  });
});
