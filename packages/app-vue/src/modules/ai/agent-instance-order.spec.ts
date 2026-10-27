import { describe, expect, it } from 'vitest';
import type { AgentInstance } from '@memoflow/ai-contracts';
import { sortAgentInstances } from './agent-instance-order';

const native = (
  instanceId: string,
  driver: AgentInstance['driver'],
  createdAt: number,
  enabled = true,
): AgentInstance => ({
  instanceId,
  driver,
  name: instanceId,
  accentColor: '#6469da',
  enabled,
  revision: 1,
  createdAt,
  updatedAt: createdAt,
});

describe('AI Settings fixed Provider grouping', () => {
  it('groups Codex, Claude, Pi, DSH and Mastra independent of input order or health', () => {
    const input = [
      native('mastra', 'mastra', 0),
      native('codex-second', 'codex', 8, false),
      native('dsh', 'dsh', 0),
      native('antigravity', 'antigravity', 0),
      native('pi', 'pi', 0),
      native('claude', 'claude', 0),
      native('codex-first', 'codex', 2),
      native('codex', 'codex', 0),
    ];
    expect(sortAgentInstances(input).map((entry) => entry.instanceId)).toEqual([
      'codex',
      'codex-first',
      'codex-second',
      'claude',
      'pi',
      'dsh',
      'antigravity',
      'mastra',
    ]);
    expect(input[0]?.instanceId).toBe('mastra');
  });

  it('keeps same-createdAt instances ordered by stable ID, not status or name', () => {
    expect(
      sortAgentInstances([
        native('codex-z', 'codex', 42, false),
        native('codex-a', 'codex', 42, true),
      ]).map((entry) => entry.instanceId),
    ).toEqual(['codex-a', 'codex-z']);
  });
});
