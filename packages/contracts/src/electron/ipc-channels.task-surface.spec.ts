import { describe, expect, it } from 'vitest';
import { TaskChannels } from './ipc-channels';

/**
 * Task IPC surface (stage-6 residual):
 * Unsupported task:occurrence:update must stay retired from contracts.
 */
describe('TaskChannels surface', () => {
  it('does not expose retired unsupported occurrence update channel', () => {
    expect(TaskChannels).not.toHaveProperty('INSTANCE_UPDATE');
    expect(Object.values(TaskChannels)).not.toContain('task:occurrence:update');
  });

  it('keeps live plan/occurrence channels and retires dependency channels', () => {
    expect(TaskChannels.PLAN_LIST).toBe('task:plan:list');
    expect(TaskChannels.OCCURRENCE_LIST).toBe('task:occurrence:list');
    expect(TaskChannels.OCCURRENCE_UNCOMPLETE).toBe('task:occurrence:uncomplete');
    expect(TaskChannels).not.toHaveProperty('DEPENDENCY_CREATE');
    expect(Object.values(TaskChannels)).not.toContain('task:dependency:create');
  });
});
