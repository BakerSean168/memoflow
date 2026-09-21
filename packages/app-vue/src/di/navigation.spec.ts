import { describe, expect, it } from 'vitest';
import { defaultModuleCapsules } from './navigation';

describe('defaultModuleCapsules Routine recovery', () => {
  it('registers canonical Routine between Task and Note without reviving Reminder', () => {
    const compact = defaultModuleCapsules.map(({ id, route }) => ({ id, route }));

    expect(compact).toContainEqual({ id: 'routine', route: '/routines' });
    expect(compact.some((capsule) => capsule.id === 'reminder')).toBe(false);
    expect(compact.some((capsule) => capsule.route === '/reminders')).toBe(false);

    const ids = defaultModuleCapsules.map((capsule) => capsule.id);
    expect(ids.indexOf('task')).toBeLessThan(ids.indexOf('routine'));
    expect(ids.indexOf('routine')).toBeLessThan(ids.indexOf('note'));
  });
});
