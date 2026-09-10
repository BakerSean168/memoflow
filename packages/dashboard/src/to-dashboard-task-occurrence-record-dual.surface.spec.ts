import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  toDashboardTaskOccurrenceRecord,
  type DashboardTaskOccurrenceSource,
} from './domain/to-dashboard-task-occurrence-record';

/**
 * Residual 1156: toDashboardTaskOccurrenceRecord dual retired (dashboard domain sole).
 * Soft residual 1156: API/Desktop dashboard-read-service host wiring stays separate.
 * Soft residual 1149: toKnowledgeNoteRef Desktop/API keep-boundary remains separate.
 * Does not flip §13.2 checkboxes.
 */
describe('toDashboardTaskOccurrenceRecord dual retired (residual 1156)', () => {
  const dir = __dirname;
  const sole = readFileSync(
    resolve(dir, 'domain/to-dashboard-task-occurrence-record.ts'),
    'utf8',
  );
  const api = readFileSync(
    resolve(dir, '../../../apps/api/src/modules/dashboard/dashboard-read-service.ts'),
    'utf8',
  );
  const desktop = readFileSync(
    resolve(dir, '../../../apps/desktop/src/main/services/dashboard-read-service.ts'),
    'utf8',
  );
  const index = readFileSync(resolve(dir, 'index.ts'), 'utf8');

  it('owns sole toDashboardTaskOccurrenceRecord helper body', () => {
    expect(sole).toContain('Residual 1156');
    expect(sole).toMatch(/export function toDashboardTaskOccurrenceRecord\b/);
    expect(sole).toContain('String(instance.id)');
    expect(sole).toContain('String(instance.templateId)');
    expect(sole).toContain('updatedAt: instance.updatedAt');
    expect(sole).toContain('isOverdue: () => instance.isOverdue');
    expect(index).toContain('toDashboardTaskOccurrenceRecord');
  });

  it('retires API/Desktop dual bodies onto sole import', () => {
    for (const [label, source] of [
      ['api', api],
      ['desktop', desktop],
    ] as const) {
      expect(source, label).toContain('toDashboardTaskOccurrenceRecord');
      expect(source, label).toContain("from '@memoflow/dashboard'");
      expect(source, label).not.toMatch(/function toDashboardTaskOccurrenceRecord\b/);
      expect(source, label).toContain('Soft residual 1156');
    }
  });

  it('runtime: maps duck-typed task instance to dashboard record', () => {
    const source: DashboardTaskOccurrenceSource = {
      id: 42,
      templateId: 'tpl-1',
      status: 'completed',
      instanceDate: 1_700_000_000_000,
      actualEndTime: 1_700_000_100_000,
      updatedAt: Date.parse('2024-01-02T03:04:05.000Z'),
      deletedAt: null,
      isOverdue: false,
    };
    const record = toDashboardTaskOccurrenceRecord(source);
    expect(record.id).toBe('42');
    expect(record.templateId).toBe('tpl-1');
    expect(record.status).toBe('completed');
    expect(record.instanceDate).toBe(1_700_000_000_000);
    expect(record.actualEndTime).toBe(1_700_000_100_000);
    expect(record.updatedAt).toBe(Date.parse('2024-01-02T03:04:05.000Z'));
    expect(record.deletedAt).toBeNull();
    expect(record.isOverdue()).toBe(false);
  });

  it('documents residual 1156 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(
      resolve(dir, 'to-dashboard-task-occurrence-record-dual.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1156');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('dual retired');
  });
});
