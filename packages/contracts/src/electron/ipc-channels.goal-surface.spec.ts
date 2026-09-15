import { describe, expect, it } from 'vitest';
import { GoalChannels } from './ipc-channels';

describe('GoalChannels vNext surface', () => {
  it('keeps canonical status commands and retires legacy folder/focus/auto-expiry channels', () => {
    expect(GoalChannels.ARCHIVE).toBe('goal:archive');
    expect(GoalChannels.PLAN).toBe('goal:plan');
    expect(GoalChannels.ACTIVATE).toBe('goal:activate');
    expect(GoalChannels.COMPLETE).toBe('goal:complete');
    expect(GoalChannels.ABANDON).toBe('goal:abandon');
    expect('ARCHIVE_EXPIRED' in GoalChannels).toBe(false);
    expect('FOCUS_MODE_GET' in GoalChannels).toBe(false);
    expect('FOLDER_LIST' in GoalChannels).toBe(false);
  });
});
