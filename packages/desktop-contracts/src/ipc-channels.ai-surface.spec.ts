import { describe, expect, it } from 'vitest';
import { AIChannels, AIStreamChannels } from './ipc-channels';

/** AI-VNEXT-07: only the canonical Mastra Assistant/Workflow IPC runtime survives. */
describe('AIChannels / AIStreamChannels vNext surface', () => {
  it('keeps canonical Mastra request channels and runtime push events', () => {
    expect(AIChannels.RUNTIME_ASSISTANT_START).toBe('ai:runtime:assistant:start');
    expect(AIChannels.RUNTIME_ASSISTANT_CANCEL).toBe('ai:runtime:assistant:cancel');
    expect(AIChannels.RUNTIME_ASSISTANT_HISTORY).toBe('ai:runtime:assistant:history');
    expect(AIChannels.RUNTIME_ASSISTANT_DELETE).toBe('ai:runtime:assistant:delete');
    expect(AIChannels.RUNTIME_USAGE_GET).toBe('ai:runtime:usage:get');
    expect(AIChannels.RUNTIME_WORKFLOW_START).toBe('ai:runtime:workflow:start');
    expect(AIChannels.RUNTIME_WORKFLOW_RESUME).toBe('ai:runtime:workflow:resume');
    expect(AIChannels.RUNTIME_WORKFLOW_GET).toBe('ai:runtime:workflow:get');
    expect(AIChannels.RUNTIME_WORKFLOW_LIST).toBe('ai:runtime:workflow:list');
    expect(AIChannels.RUNTIME_WORKFLOW_CANCEL).toBe('ai:runtime:workflow:cancel');
    expect(AIChannels.RUNTIME_WORKFLOW_GOAL_SURFACE_LEASE).toBe(
      'ai:runtime:workflow:goal-surface-lease',
    );
    expect(AIStreamChannels.RUNTIME_ASSISTANT_EVENT).toBe('ai:runtime:assistant:event');
    expect(AIStreamChannels.RUNTIME_ASSISTANT_ERROR).toBe('ai:runtime:assistant:error');
  });

  it('does not reintroduce legacy message-stream or AssistantFacade IPC channels', () => {
    const requestChannels = Object.values(AIChannels);
    const pushChannels = Object.values(AIStreamChannels);
    for (const legacy of [
      'ai:chat:message:stream:start',
      'ai:chat:message:stream:cancel',
      'ai:assistant:dispatch:start',
      'ai:assistant:dispatch:cancel',
      'ai:agent:run:start',
    ]) {
      expect(requestChannels).not.toContain(legacy);
    }
    for (const legacy of [
      'ai:chat:message:stream:chunk',
      'ai:chat:message:stream:done',
      'ai:chat:message:stream:error',
      'ai:assistant:dispatch:event',
      'ai:assistant:dispatch:done',
      'ai:assistant:dispatch:error',
    ]) {
      expect(pushChannels).not.toContain(legacy);
    }
  });
});
