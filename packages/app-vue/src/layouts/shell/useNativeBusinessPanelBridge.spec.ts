import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppShellStore } from './useAppShellStore';
import { useNativeBusinessPanelBridge } from './useNativeBusinessPanelBridge';
import type { GoalNativeDraftState, GoalNativeEditSession } from '../../modules/goal/composables/goalNativeEditSession';
import { GoalStatus } from '@memoflow/contracts/goal';

// Mock useGoalNativeSurface
let mockSession: any = null;
let controlledSession: any = null;
let surfaceAvailable = true;

const mockGoalSurface = {
  isAvailable: () => surfaceAvailable,
  locate: () => mockSession,
  openControlled: vi.fn(async (ownerId: string, options?: any) => {
    if (!surfaceAvailable) throw new Error('Business surface conflict');
    const store = useAppShellStore();
    store.claimBusinessControl(ownerId, store.activeTab?.route || '/goals');
    controlledSession = mockSession;
    return mockSession;
  }),
  getControlledSession: (ownerId: string) => controlledSession,
  releaseControlledSession: vi.fn((ownerId: string) => {
    const store = useAppShellStore();
    if (store.businessControl?.ownerId === ownerId) {
      store.releaseBusinessControl(ownerId, store.businessControl.version);
    }
    controlledSession = null;
  }),
};

vi.mock('./useGoalNativeSurface', () => ({
  useGoalNativeSurface: () => mockGoalSurface,
}));

describe('useNativeBusinessPanelBridge', () => {
  let draftState: GoalNativeDraftState;

  beforeEach(() => {
    setActivePinia(createPinia());
    surfaceAvailable = true;
    controlledSession = null;

    draftState = {
      revision: 1,
      mode: 'create',
      goalId: null,
      dirty: false,
      busy: false,
      error: null,
      draft: {
        name: 'Initial Goal',
        summary: 'Initial Summary',
        description: 'Initial Description',
        status: GoalStatus.Planned,
        start: null,
        target: null,
        reminderConfig: null,
        labelIds: [],
        keyResults: [],
      },
    };

    mockSession = {
      readDraftState: vi.fn(() => ({ ...draftState, draft: { ...draftState.draft } })),
      patch: vi.fn((changes: any) => {
        draftState.revision++;
        if (changes.name !== undefined) draftState.draft.name = changes.name;
        if (changes.summary !== undefined) draftState.draft.summary = changes.summary;
        if (changes.description !== undefined) draftState.draft.description = changes.description;
      }),
      addChild: vi.fn((child: any) => {
        draftState.revision++;
        draftState.draft.keyResults.push(child);
      }),
      removeChild: vi.fn((idx: number) => {
        draftState.revision++;
        draftState.draft.keyResults.splice(idx, 1);
      }),
      focus: vi.fn(async () => {}),
      requestSubmit: vi.fn(async () => {
        return {
          id: 'goal-123',
          name: draftState.draft.name,
          version: 1,
          status: draftState.draft.status,
        };
      }),
      releaseControl: vi.fn(() => {
        controlledSession = null;
      }),
    };
  });

  it('returns clean snapshot when form is not open', async () => {
    const store = useAppShellStore();
    mockSession = null;

    const bridge = useNativeBusinessPanelBridge();
    const resp = await bridge.handleCommand({
      requestId: 'req-1',
      identityId: 'id-1',
      conversationId: 'conv-1',
      runId: 'run-1',
      command: { action: 'snapshot' },
    });

    expect(resp.ok).toBe(true);
    expect(resp.snapshot?.formOpen).toBe(false);
    expect(resp.snapshot?.allowedActions).toContain('open');
  });

  it('opens controlled goal form and executes patch, add_key_result, and submit', async () => {
    const store = useAppShellStore();
    store.openTab({ module: 'goal', route: '/goals', title: 'Goal', intent: 'deeplink' });

    const bridge = useNativeBusinessPanelBridge();
    const reqBase = {
      requestId: 'req-1',
      identityId: 'id-1',
      conversationId: 'conv-1',
      runId: 'run-1',
    };

    // 1. Open
    const openResp = await bridge.handleCommand({
      ...reqBase,
      command: { action: 'open', mode: 'create' },
    });
    expect(openResp.ok).toBe(true);
    expect(openResp.snapshot?.formOpen).toBe(true);
    expect(openResp.snapshot?.isControlled).toBe(true);
    expect(openResp.snapshot?.controlledByMe).toBe(true);
    expect(store.businessControl).not.toBeNull();

    // 2. Patch field
    const patchResp = await bridge.handleCommand({
      ...reqBase,
      command: {
        action: 'patch',
        expectedRevision: 1,
        name: 'Agent Updated Goal',
      },
    });
    expect(patchResp.ok).toBe(true);
    expect(patchResp.snapshot?.fields?.name).toBe('Agent Updated Goal');
    expect(patchResp.snapshot?.revision).toBe(2);

    // 3. Add Key Result
    const krResp = await bridge.handleCommand({
      ...reqBase,
      command: {
        action: 'add_key_result',
        expectedRevision: 2,
        keyResult: {
          title: 'Complete milestone 1',
          initialValue: 0,
          targetValue: 100,
          currentValue: 0,
          unit: '%',
          weight: 50,
        },
      },
    });
    expect(krResp.ok).toBe(true);
    expect(krResp.snapshot?.keyResults).toHaveLength(1);
    expect(krResp.snapshot?.keyResults?.[0].title).toBe('Complete milestone 1');

    // 4. Submit
    const submitResp = await bridge.handleCommand({
      ...reqBase,
      command: {
        action: 'submit',
        expectedRevision: 3,
      },
    });
    expect(submitResp.ok).toBe(true);
    expect(submitResp.submitResult?.goalId).toBe('goal-123');
    expect(submitResp.submitResult?.name).toBe('Agent Updated Goal');
  });

  it('rejects patch when revision conflicts', async () => {
    const store = useAppShellStore();
    store.openTab({ module: 'goal', route: '/goals', title: 'Goal', intent: 'deeplink' });

    const bridge = useNativeBusinessPanelBridge();
    const reqBase = {
      requestId: 'req-1',
      identityId: 'id-1',
      conversationId: 'conv-1',
      runId: 'run-1',
    };

    await bridge.handleCommand({
      ...reqBase,
      command: { action: 'open', mode: 'create' },
    });

    const patchResp = await bridge.handleCommand({
      ...reqBase,
      command: {
        action: 'patch',
        expectedRevision: 999, // Mismatch!
        name: 'Should fail',
      },
    });

    expect(patchResp.ok).toBe(false);
    expect(patchResp.error?.code).toBe('REVISION_CONFLICT');
  });

  it('rejects patch when not controlled', async () => {
    const bridge = useNativeBusinessPanelBridge();
    const patchResp = await bridge.handleCommand({
      requestId: 'req-1',
      identityId: 'id-1',
      conversationId: 'conv-1',
      runId: 'run-1',
      command: {
        action: 'patch',
        name: 'Should fail',
      },
    });

    expect(patchResp.ok).toBe(false);
    expect(patchResp.error?.code).toBe('PANEL_NOT_CONTROLLED');
  });
});
