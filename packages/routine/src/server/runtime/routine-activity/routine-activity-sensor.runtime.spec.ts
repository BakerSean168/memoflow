import { describe, expect, it, vi } from 'vitest';
import { FakeActivitySensor, FakeIdleSensor } from './fakes';
import { createRoutineActivitySensorRuntime } from './routine-activity-sensor.runtime';
import { asInstant } from '@memoflow/time';

describe('Routine activity sensor runtime (ROUTINE-4101)', () => {
  it('normalizes startup active, idle, and resumed observations', () => {
    const idle = new FakeIdleSensor();
    let now = 1_000;
    const runtime = createRoutineActivitySensorRuntime({
      idleSensor: idle,
      idleThresholdMs: 60_000,
      now: () => now,
    });
    const events = [] as Array<{ type: string; idleDurationMs: number }>;
    runtime.onActivityChanged((event) => events.push(event));

    runtime.start();
    now = 61_000;
    idle.emitIdle(60_000, now);
    now = 70_000;
    idle.emitResume(now);

    expect(events.map((event) => event.type)).toEqual(['UserActive', 'UserIdle', 'UserResumed']);
    expect(events[2]?.idleDurationMs).toBe(60_000);
    expect(runtime.getCurrentActivityState()).toEqual({
      state: 'active',
      observedAt: asInstant(70_000),
      idleDurationMs: 0,
    });
  });

  it('cleans subscriptions and restarts without duplicate listeners', () => {
    const idle = new FakeIdleSensor();
    const runtime = createRoutineActivitySensorRuntime({
      idleSensor: idle,
      idleThresholdMs: 5_000,
      now: () => 100,
    });
    const listener = vi.fn();
    const unsubscribe = runtime.onActivityChanged(listener);

    runtime.start();
    runtime.start();
    expect(idle.subscriberCount).toBe(2);

    runtime.stop();
    runtime.stop();
    expect(idle.subscriberCount).toBe(0);

    runtime.start();
    expect(idle.subscriberCount).toBe(2);
    idle.emitIdle(5_000, 200);
    expect(listener.mock.calls.filter(([event]) => event.type === 'UserIdle')).toHaveLength(1);

    runtime.stop();
    unsubscribe();
    expect(idle.subscriberCount).toBe(0);
  });

  it('starts in idle state when the persisted OS idle duration is already past threshold', () => {
    const idle = new FakeIdleSensor();
    idle.setIdleDuration(90_000);
    const runtime = createRoutineActivitySensorRuntime({
      idleSensor: idle,
      idleThresholdMs: 60_000,
      now: () => 123,
    });
    const listener = vi.fn();
    runtime.onActivityChanged(listener);

    runtime.start();

    expect(listener).toHaveBeenCalledWith({
      type: 'UserIdle',
      at: asInstant(123),
      idleDurationMs: 90_000,
    });
  });

  it('provides a deterministic ActivitySensor fake for downstream runtime tests', () => {
    const activity = new FakeActivitySensor(10);
    const listener = vi.fn();
    const unsubscribe = activity.onActivityChanged(listener);

    activity.emit({ type: 'UserIdle', at: asInstant(20), idleDurationMs: 6_000 });
    expect(activity.getCurrentActivityState().state).toBe('idle');
    unsubscribe();
    activity.emit({ type: 'UserResumed', at: asInstant(30), idleDurationMs: 6_000 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(activity.subscriberCount).toBe(0);
  });
});
