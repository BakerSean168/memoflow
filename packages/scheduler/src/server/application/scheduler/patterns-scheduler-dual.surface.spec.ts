import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FakeTimer, MinHeap, NoopScheduleMonitor } from '@memoflow/patterns/scheduler';

/**
 * Residual 1039: schedule dead i-schedule-timer/monitor/min-heap duals retired
 * onto @memoflow/patterns/scheduler sole (already re-exported by schedule index).
 * Soft residual 1040: tip focused suite numbers track Residual 1040 evidence tip (310/1343).
 * Does not flip §13.2 checkboxes.
 */
describe('patterns scheduler dual retired (residual 1039)', () => {
  const scheduleDir = __dirname;
  const patternsRoot = resolve(__dirname, '../../../../../patterns/src/scheduler');
  const soleTimer = readFileSync(resolve(patternsRoot, 'schedule-timer.ts'), 'utf8');
  const soleMonitor = readFileSync(resolve(patternsRoot, 'schedule-monitor.ts'), 'utf8');
  const soleHeap = readFileSync(resolve(patternsRoot, 'priority-queue/min-heap.ts'), 'utf8');
  const scheduleIndex = readFileSync(resolve(scheduleDir, 'index.ts'), 'utf8');
  const taskQueue = readFileSync(resolve(scheduleDir, 'schedule-task-queue.ts'), 'utf8');

  it('owns sole timer/monitor/min-heap bodies in patterns', () => {
    expect(soleTimer).toContain('Residual 1039');
    expect(soleTimer).toMatch(/export interface IScheduleTimer\b/);
    expect(soleTimer).toMatch(/export class NodeTimer\b/);
    expect(soleTimer).toMatch(/export class FakeTimer\b/);

    expect(soleMonitor).toContain('Residual 1039');
    expect(soleMonitor).toMatch(/export interface IScheduleMonitor\b/);
    expect(soleMonitor).toMatch(/export class NoopScheduleMonitor\b/);
    expect(soleMonitor).toMatch(/export class InMemoryScheduleMonitor\b/);

    expect(soleHeap).toContain('Residual 1039');
    expect(soleHeap).toMatch(/export class MinHeap\b/);
    expect(soleHeap).toMatch(/export interface HeapItem\b/);
  });

  it('schedule scheduler dir has no local dual bodies', () => {
    for (const name of ['i-schedule-timer.ts', 'i-schedule-monitor.ts', 'min-heap.ts'] as const) {
      expect(existsSync(resolve(scheduleDir, name)), name).toBe(false);
    }
  });

  it('schedule index re-exports patterns sole without local dual paths', () => {
    expect(scheduleIndex).toContain("from '@memoflow/patterns/scheduler'");
    expect(scheduleIndex).toContain('IScheduleTimer');
    expect(scheduleIndex).toContain('IScheduleMonitor');
    expect(scheduleIndex).toContain('MinHeap');
    expect(scheduleIndex).not.toContain("from './i-schedule-timer'");
    expect(scheduleIndex).not.toContain("from './i-schedule-monitor'");
    expect(scheduleIndex).not.toContain("from './min-heap'");
    expect(taskQueue).toContain("from '@memoflow/patterns/scheduler'");
    expect(taskQueue).not.toContain("from './i-schedule-timer'");
    expect(taskQueue).not.toContain("from './i-schedule-monitor'");
    expect(taskQueue).not.toContain("from './min-heap'");
  });

  it('patterns sole timer/heap/monitor remain importable', () => {
    const timer = new FakeTimer();
    const id = timer.setTimeout(() => undefined, 10);
    expect(id).toBeDefined();
    timer.clearTimeout(id);

    const heap = new MinHeap();
    heap.insert({ taskId: 'a', nextRunAt: 2 });
    heap.insert({ taskId: 'b', nextRunAt: 1 });
    expect(heap.peek()?.taskId).toBe('b');
    expect(heap.extractMin()?.taskId).toBe('b');

    const monitor = new NoopScheduleMonitor();
    expect(typeof monitor.recordExecutionStart).toBe('function');
    monitor.recordExecutionStart('t1', 'task');
  });
});
