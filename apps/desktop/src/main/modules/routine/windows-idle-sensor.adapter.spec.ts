import { describe, expect, it, vi } from 'vitest';
import { WindowsIdleSensorAdapter } from './windows-idle-sensor.adapter';

describe('WindowsIdleSensorAdapter (ROUTINE-4101)', () => {
  it('Fixture G Desktop: Electron idle time emits one idle/resume transition for ActiveUsage', () => {
    vi.useFakeTimers();
    let idleSeconds = 0;
    let now = 1_000;
    const adapter = new WindowsIdleSensorAdapter({
      idleThresholdMs: 5_000,
      pollIntervalMs: 1_000,
      capability: { getSystemIdleTime: () => idleSeconds },
      now: () => now,
    });
    const onIdle = vi.fn();
    const onResume = vi.fn();
    const offIdle = adapter.onIdle(onIdle);
    const offResume = adapter.onResume(onResume);

    idleSeconds = 5;
    now = 2_000;
    vi.advanceTimersByTime(1_000);
    idleSeconds = 7;
    now = 3_000;
    vi.advanceTimersByTime(1_000);
    idleSeconds = 0;
    now = 4_000;
    vi.advanceTimersByTime(1_000);

    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(onIdle.mock.calls[0]?.[0]).toMatchObject({ idleDurationMs: 5_000 });
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResume.mock.calls[0]?.[0]).toMatchObject({ idleDurationMs: 7_000 });

    offIdle();
    expect(adapter.isPolling).toBe(true);
    offResume();
    expect(adapter.isPolling).toBe(false);
    vi.useRealTimers();
  });

  it('cleans polling on dispose and can be subscribed again after an app/profile restart', () => {
    vi.useFakeTimers();
    const capability = { getSystemIdleTime: vi.fn(() => 0) };
    const adapter = new WindowsIdleSensorAdapter({
      idleThresholdMs: 5_000,
      capability,
    });

    const firstOff = adapter.onIdle(vi.fn());
    expect(adapter.isPolling).toBe(true);
    firstOff();
    expect(adapter.isPolling).toBe(false);

    const secondOff = adapter.onResume(vi.fn());
    expect(adapter.isPolling).toBe(true);
    adapter.dispose();
    expect(adapter.isPolling).toBe(false);
    secondOff();

    vi.useRealTimers();
  });
});
