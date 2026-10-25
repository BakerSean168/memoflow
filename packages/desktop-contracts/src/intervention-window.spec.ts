import { describe, expect, it } from 'vitest';
import { InterventionWindowCommandSchema } from './intervention-window';

describe('InterventionWindowCommandSchema (ROUTINE-4104)', () => {
  it('keeps the renderer command surface minimal and validates snooze duration', () => {
    expect(InterventionWindowCommandSchema.parse({ action: 'complete' })).toEqual({
      action: 'complete',
    });
    expect(
      InterventionWindowCommandSchema.parse({ action: 'snooze', durationMs: 300_000 }),
    ).toEqual({ action: 'snooze', durationMs: 300_000 });
    expect(() =>
      InterventionWindowCommandSchema.parse({ action: 'snooze', durationMs: 0 }),
    ).toThrow();
    expect(() =>
      InterventionWindowCommandSchema.parse({ action: 'dismiss', hiddenOwnerMutation: true }),
    ).toThrow();
  });
});
