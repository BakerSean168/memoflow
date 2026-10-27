import { asInstant, type Instant } from '@memoflow/time';
import type {
  ActivitySensorPort,
  IdleSensorPort,
  RoutineActivityEvent,
  RoutineActivityListener,
  RoutineActivitySnapshot,
  UserIdleObserved,
  UserResumeObserved,
} from '../../domain/ports';

export class FakeIdleSensor implements IdleSensorPort {
  private idleDurationMs = 0;
  private readonly idleListeners = new Set<(event: UserIdleObserved) => void>();
  private readonly resumeListeners = new Set<(event: UserResumeObserved) => void>();

  get subscriberCount(): number {
    return this.idleListeners.size + this.resumeListeners.size;
  }

  getIdleDurationMs(): number {
    return this.idleDurationMs;
  }

  onIdle(listener: (event: UserIdleObserved) => void): () => void {
    this.idleListeners.add(listener);
    return () => this.idleListeners.delete(listener);
  }

  onResume(listener: (event: UserResumeObserved) => void): () => void {
    this.resumeListeners.add(listener);
    return () => this.resumeListeners.delete(listener);
  }

  setIdleDuration(idleDurationMs: number): void {
    this.idleDurationMs = Math.max(0, idleDurationMs);
  }

  emitIdle(idleDurationMs: number, at: Instant | number): void {
    this.setIdleDuration(idleDurationMs);
    const event = { at: asInstant(Number(at)), idleDurationMs: this.idleDurationMs };
    for (const listener of [...this.idleListeners]) listener(event);
  }

  emitResume(at: Instant | number): void {
    const previousIdleDurationMs = this.idleDurationMs;
    this.idleDurationMs = 0;
    const event = { at: asInstant(Number(at)), idleDurationMs: previousIdleDurationMs };
    for (const listener of [...this.resumeListeners]) listener(event);
  }
}

export class FakeActivitySensor implements ActivitySensorPort {
  private readonly listeners = new Set<RoutineActivityListener>();
  private snapshot: RoutineActivitySnapshot;

  constructor(now: Instant | number = 0) {
    this.snapshot = { state: 'active', observedAt: asInstant(Number(now)), idleDurationMs: 0 };
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }

  getCurrentActivityState(): RoutineActivitySnapshot {
    return { ...this.snapshot };
  }

  onActivityChanged(listener: RoutineActivityListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: RoutineActivityEvent): void {
    this.snapshot = {
      state: event.type === 'UserIdle' ? 'idle' : 'active',
      observedAt: event.at,
      idleDurationMs: event.type === 'UserIdle' ? event.idleDurationMs : 0,
    };
    for (const listener of [...this.listeners]) listener(event);
  }
}
