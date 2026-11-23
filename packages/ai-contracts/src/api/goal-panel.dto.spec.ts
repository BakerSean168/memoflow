import { describe, expect, it } from 'vitest';
import {
  GoalPanelCommandSchema,
  GoalPanelPresentInputSchema,
  GoalPanelSnapshotSchema,
  NativePanelIpcRequestSchema,
  NativePanelIpcResponseSchema,
} from './goal-panel.dto';

describe('GoalPanel DTO and IPC schemas', () => {
  it('validates a bounded panel snapshot', () => {
    const validSnapshot = {
      activeModule: 'goal',
      activeTabRoute: '/goals',
      panelSurface: 'business',
      formOpen: true,
      mode: 'create',
      goalId: null,
      revision: 2,
      dirty: true,
      busy: false,
      error: null,
      isControlled: true,
      controlledByMe: true,
      fields: {
        name: 'Launch BYOA Integration',
        summary: 'Goal panel direct control',
        description: 'Enables semantic tools without DOM injection',
        status: 'Planned',
        start: null,
        target: null,
        labelIds: ['label-1'],
      },
      keyResults: [
        {
          title: 'Cover 100% of panel IPC flows',
          initialValue: 0,
          targetValue: 100,
          currentValue: 0,
          unit: '%',
          weight: 3,
        },
      ],
      allowedActions: ['patch', 'add_key_result', 'submit', 'release'],
    };

    const parsed = GoalPanelSnapshotSchema.safeParse(validSnapshot);
    expect(parsed.success).toBe(true);
  });

  it('validates discriminated panel commands', () => {
    const openCmd = { action: 'open', mode: 'create' };
    expect(GoalPanelCommandSchema.safeParse(openCmd).success).toBe(true);

    const patchCmd = {
      action: 'patch',
      expectedRevision: 1,
      name: 'Updated Name',
      keyResult: {
        index: 0,
        changes: { title: 'New KR title' },
      },
    };
    expect(GoalPanelCommandSchema.safeParse(patchCmd).success).toBe(true);

    const createKr = GoalPanelCommandSchema.safeParse({
      action: 'add_key_result',
      keyResult: { title: 'First milestone', targetValue: 10 },
    });
    expect(createKr.success).toBe(true);
    if (createKr.success && createKr.data.action === 'add_key_result') {
      expect(createKr.data.keyResult).toMatchObject({
        initialValue: 0,
        calculationMethod: 'Sum',
        targetValue: 10,
        weight: 3,
      });
    }
    expect(
      GoalPanelCommandSchema.safeParse({
        action: 'add_key_result',
        keyResult: { title: 'Missing target' },
      }).success,
    ).toBe(false);

    const submitCmd = { action: 'submit', expectedRevision: 2 };
    expect(GoalPanelCommandSchema.safeParse(submitCmd).success).toBe(true);

    const releaseCmd = { action: 'release' };
    expect(GoalPanelCommandSchema.safeParse(releaseCmd).success).toBe(true);
  });

  it('validates IPC request and response envelopes', () => {
    const request = {
      requestId: 'req-1',
      identityId: 'id-1',
      conversationId: 'conv-1',
      runId: 'run-1',
      command: { action: 'snapshot' },
    };
    expect(NativePanelIpcRequestSchema.safeParse(request).success).toBe(true);
    expect(
      NativePanelIpcRequestSchema.safeParse({ ...request, sessionBinding: 'host-issued' }).success,
    ).toBe(true);
    expect(
      GoalPanelCommandSchema.safeParse({ action: 'open', sessionBinding: 'forged' }).success,
    ).toBe(false);

    const response = {
      requestId: 'req-1',
      ok: true,
      snapshot: {
        activeModule: 'goal',
        activeTabRoute: '/goals',
        panelSurface: 'business',
        formOpen: false,
        dirty: false,
        busy: false,
        isControlled: false,
        controlledByMe: false,
        allowedActions: ['open'],
      },
    };
    expect(NativePanelIpcResponseSchema.safeParse(response).success).toBe(true);
  });
});

it('accepts a bounded external presentation without inventing a conversation or submission authority', () => {
  const request = {
    requestId: 'external-request',
    identityId: 'owner',
    clientId: 'mcp-client',
    sessionBinding: 'host-issued',
    command: { action: 'open', mode: 'create' },
  };
  expect(NativePanelIpcRequestSchema.safeParse(request).success).toBe(true);
  expect(
    NativePanelIpcRequestSchema.safeParse({ ...request, command: { action: 'submit' } }).success,
  ).toBe(false);
  expect(
    NativePanelIpcRequestSchema.safeParse({ ...request, sessionBinding: undefined }).success,
  ).toBe(false);
  expect(
    NativePanelIpcRequestSchema.safeParse({ ...request, conversationId: 'injected' }).success,
  ).toBe(false);
  expect(
    GoalPanelPresentInputSchema.safeParse({
      mode: 'create',
      fields: { name: ' Release ' },
      keyResults: [{ title: 'Released', targetValue: 1 }],
    }),
  ).toMatchObject({ success: true, data: { fields: { name: 'Release' } } });
  expect(
    GoalPanelPresentInputSchema.safeParse({ mode: 'create', fields: { name: ' ' } }).success,
  ).toBe(false);
  expect(
    GoalPanelPresentInputSchema.safeParse({
      mode: 'edit',
      goalId: 'saved-goal',
      fields: { name: 'overwrite' },
    }).success,
  ).toBe(false);
});
