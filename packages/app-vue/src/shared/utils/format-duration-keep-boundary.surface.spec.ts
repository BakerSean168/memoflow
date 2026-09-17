import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1243: formatDuration keep-boundary (schedule ms export vs minutes i18n vs task variants).
 * - app-vue schedule-presentation: durationMs null→'-'; ms/sec presentation i18n
 * - app-vue ScheduleConflictAlert: total minutes → schedule.duration.* (hours-only band)
 * Residual 1324: ScheduleConflictAlert + ScheduleFormDemo minutes maps dual-retired onto
 * formatScheduleDurationMinutes sole (still minutes unit vs presentation durationMs).
 * Soft residual 1243:
 * - ConflictAlert: ms floor; hoursMinutes always when h>0
 * - schedule-presentation durationMs/Sec keep-boundary remains
 * - formatTaskDuration: Intl unit hour/minute
 * - ADR-080: CalendarEntry mutation payload no longer carries duration; read surfaces derive it from range
 * Soft residual 1240: formatDate keep-boundary remains separate.
 * Does not flip §13.2 checkboxes.
 */
describe('formatDuration keep-boundary (residual 1243)', () => {
  const dir = __dirname;
  const presentation = readFileSync(
    resolve(dir, '../../modules/schedule/utils/schedule-presentation.ts'),
    'utf8',
  );
  const conflictAlert = readFileSync(
    resolve(dir, '../../modules/schedule/components/ScheduleConflictAlert.vue'),
    'utf8',
  );
  const conflictMs = readFileSync(
    resolve(dir, '../../modules/schedule/components/ConflictAlert.vue'),
    'utf8',
  );
  const formDemo = readFileSync(
    resolve(dir, '../../modules/schedule/components/ScheduleFormDemo.vue'),
    'utf8',
  );
  const taskUtil = readFileSync(
    resolve(dir, '../../modules/task/utils/format-task-duration.ts'),
    'utf8',
  );
  const react = readFileSync(
    resolve(dir, '../../../../app-react/src/screens/ScheduleEventEditorScreen.tsx'),
    'utf8',
  );

  it('owns Residual 1243 keep-boundary markers on schedule-presentation ms formatDuration', () => {
    expect(presentation).toContain('Residual 1243 keep-boundary');
    expect(presentation).toMatch(/export function formatDuration\b/);
    expect(presentation).toContain('durationMs: number | null | undefined');
    expect(presentation).toContain("return '-'");
    expect(presentation).toContain('schedule.presentation.durationMs');
    expect(presentation).toContain('schedule.presentation.durationSec');
    const body = presentation.match(/export function formatDuration\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('durationMs');
    expect(body).toContain('toFixed(2)');
    expect(body).not.toContain('schedule.duration.minutes');
    expect(body).not.toContain('task.dependencyGraph');
    expect(body).not.toContain('Intl.NumberFormat');
  });

  it('differs from minutes-based ScheduleConflictAlert formatDuration (no force-merge)', () => {
    expect(conflictAlert).toContain('Residual 1243 keep-boundary');
    expect(conflictAlert).toContain('Residual 1324');
    expect(conflictAlert).toMatch(/const formatDuration\b/);
    expect(conflictAlert).toContain('formatScheduleDurationMinutes');
    const body = conflictAlert.match(/const formatDuration = \([\s\S]*?;/)?.[0] ?? '';
    expect(body).toContain('formatScheduleDurationMinutes');
    expect(body).not.toContain('durationMs');
    expect(body).not.toContain("return '-'");
    expect(body).not.toContain('schedule.presentation');
    // sole owns minutes schedule.duration.* bands
    const sole = readFileSync(resolve(dir, 'format-schedule-duration-minutes.ts'), 'utf8');
    expect(sole).toContain('schedule.duration.minutes');
    expect(sole).toContain('schedule.duration.hours');
    expect(sole).toContain('schedule.duration.hoursMinutes');
  });

  it('soft residual 1243 ms floor / demo / Intl stay separate while CalendarEntry duration is derived', () => {
    expect(conflictMs).toContain('Soft residual 1243');
    const msBody = conflictMs.match(/function formatDuration\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(msBody).toContain('splitDurationMs');
    expect(msBody).toContain('hoursMinutes');
    expect(msBody).not.toContain("schedule.duration.hours'");
    expect(msBody).not.toContain('schedule.duration.hours"');
    expect(msBody).toContain('schedule.duration.hoursMinutes');

    // Residual 1324: FormDemo minutes dual retired onto formatScheduleDurationMinutes sole
    expect(formDemo).toContain('Residual 1324');
    expect(formDemo).toContain('formatScheduleDurationMinutes');
    const formBody = formDemo.match(/function formatDuration\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(formBody).toContain('formatScheduleDurationMinutes');
    expect(formBody).not.toContain('schedule.duration.minutes');

    expect(taskUtil).toContain('Soft residual 1243');
    expect(taskUtil).toMatch(/export function formatTaskDuration\b/);
    expect(taskUtil).toContain('Intl.NumberFormat');
    expect(taskUtil).toContain("unit: 'hour'");

    expect(react).toContain('getProductTime');
    expect(react).not.toMatch(/function buildDuration\b/);
    expect(react).toContain("kind: 'Timed'");
    expect(react).not.toMatch(/\bduration:\s*buildDuration/);
  });

  it('runtime: documents ms/sec vs minutes i18n vs compute contracts via body shape', () => {
    function presentationFormatDuration(
      durationMs: number | null | undefined,
      t: (k: string, p?: object) => string,
    ): string {
      if (durationMs === null || durationMs === undefined) return '-';
      if (durationMs < 1000) return t('schedule.presentation.durationMs', { ms: durationMs });
      return t('schedule.presentation.durationSec', { sec: (durationMs / 1000).toFixed(2) });
    }
    function conflictMinutesFormatDuration(
      minutes: number,
      t: (k: string, p?: object) => string,
    ): string {
      if (minutes < 60) return t('schedule.duration.minutes', { n: minutes });
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0
        ? t('schedule.duration.hoursMinutes', { h: hours, m: mins })
        : t('schedule.duration.hours', { h: hours });
    }
    const t = (k: string, p?: object) => (p ? `${k}:${JSON.stringify(p)}` : k);
    expect(presentationFormatDuration(null, t)).toBe('-');
    expect(presentationFormatDuration(500, t)).toContain('durationMs');
    expect(presentationFormatDuration(2500, t)).toContain('durationSec');
    expect(conflictMinutesFormatDuration(30, t)).toContain('minutes');
    expect(conflictMinutesFormatDuration(120, t)).toContain('hours');
    expect(conflictMinutesFormatDuration(90, t)).toContain('hoursMinutes');
  });

  it('documents residual 1243 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(
      resolve(dir, 'format-duration-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1243');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
