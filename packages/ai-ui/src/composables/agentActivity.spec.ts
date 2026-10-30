import { describe, expect, it } from 'vitest';
import { projectAgentActivity } from './agentActivity';
import type { ChatItem } from './types';

const item: ChatItem = {
  id: 'a',
  role: 'assistant',
  content: '',
  status: 'generating',
  nativeActivities: [
    { toolCallId: '1', label: 'commandExecution', state: 'running' },
    {
      toolCallId: '2',
      label: 'execute --token PRIVATE_ARGUMENT',
      state: 'failed',
    },
  ],
};

describe('Agent activity projection', () => {
  it('projects concurrent native tools and real failure without arguments or inferred reasoning', () => {
    const view = projectAgentActivity(item);
    expect(view.phase).toBe('processing');
    expect(view.active).toBe(true);
    expect(view.running.map((call) => call.name)).toEqual(['commandExecution']);
    expect(view.records[1]).toMatchObject({ name: '', state: 'failed' });
    expect(JSON.stringify(view)).not.toContain('PRIVATE_ARGUMENT');
    expect(projectAgentActivity({ ...item, nativeActivities: [] }).phase).toBe('preparing');
    expect(
      projectAgentActivity({
        ...item,
        nativeActivities: [],
        activityUpdatedAt: 1,
      }).phase,
    ).toBe('processing');
  });

  it.each(['success', 'aborted', 'error', 'interrupted'] as const)(
    'never replays a running snapshot as live after %s',
    (status) => {
      const view = projectAgentActivity({ ...item, status });
      expect(view.active).toBe(false);
      expect(view.running).toEqual([]);
      expect(view.records[0].state).toBe('interrupted');
      expect(view.records[1].state).toBe('failed');
    },
  );

  it('pauses for pending or sending input including restored suspended runs', () => {
    for (const status of ['pending', 'sending'] as const) {
      const view = projectAgentActivity({
        ...item,
        status: 'success',
        askUserRequests: [
          {
            toolCallId: 'ask',
            runId: 'r',
            conversationId: 'c',
            question: 'Choose',
            status,
          },
        ],
      });
      expect(view.phase).toBe('waiting');
      expect(view.active).toBe(false);
    }
  });

  it('bounds the history and keeps stable tool identifiers', () => {
    const view = projectAgentActivity({
      ...item,
      nativeActivities: Array.from({ length: 300 }, (_, i) => ({
        toolCallId: `${i}`,
        label: 'search',
        state: 'completed',
      })),
    });
    expect(view.records).toHaveLength(256);
    expect(view.records.at(-1)?.id).toBe('native:299');
  });
});
