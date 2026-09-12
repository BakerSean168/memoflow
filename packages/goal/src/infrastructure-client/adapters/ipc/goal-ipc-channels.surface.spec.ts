import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GoalChannels, GoalWorkspaceChannels } from '@memoflow/contracts/electron';

describe('GoalIpcAdapter vNext channel surface', () => {
  const source = readFileSync(resolve(__dirname, 'goal-ipc.adapter.ts'), 'utf8');

  it('uses canonical Goal + Goal Workspace channels without legacy status surfaces', () => {
    expect(source).toContain(
      "import { GoalChannels, GoalWorkspaceChannels } from '@memoflow/contracts/electron'",
    );
    expect(source).toContain('GoalChannels.CREATE');
    expect(source).toContain('GoalChannels.ABANDON');
    expect(source).toContain('GoalWorkspaceChannels.GET');
    expect(source).toContain('GoalWorkspaceChannels.TASKS');
    expect(source).toContain('GoalWorkspaceChannels.KNOWLEDGE');
    expect(source).not.toContain('GoalChannels.ARCHIVE_EXPIRED');
    expect(source).not.toContain('AIChannels');
  });

  it('keeps canonical status and Workspace channel constants', () => {
    expect(GoalChannels.CREATE).toBe('goal:create');
    expect(GoalChannels.ABANDON).toBe('goal:abandon');
    expect(GoalWorkspaceChannels.GET).toBe('goal:workspace:get');
    expect(GoalWorkspaceChannels.TASKS).toBe('goal:workspace:tasks');
    expect(GoalWorkspaceChannels.KNOWLEDGE).toBe('goal:workspace:knowledge');
  });
});
