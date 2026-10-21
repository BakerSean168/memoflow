import { AIChannels } from '@memoflow/contracts/electron';
import {
  GoalPanelSnapshotSchema,
  NativePanelIpcRequestSchema,
  type GoalPanelSnapshot,
  type NativePanelIpcRequest,
  type NativePanelIpcResponse,
} from '@memoflow/contracts/ai';
import { getCurrentInstance, onBeforeUnmount, onMounted } from 'vue';
import { useAppShellStore } from './useAppShellStore';
import { moduleForPath } from './useShellRouterSync';
import { useGoalNativeSurface, type GoalAIEditSurface } from './useGoalNativeSurface';

export function useNativeBusinessPanelBridge(
  goalSurface: GoalAIEditSurface = useGoalNativeSurface(),
) {
  const store = useAppShellStore();

  function buildSnapshot(ownerId: string): GoalPanelSnapshot {
    const controlled = goalSurface.getControlledSession(ownerId);
    if (controlled) {
      const state = controlled.readDraftState();
      return GoalPanelSnapshotSchema.parse({
        panelSurface: store.panelSurface,
        activeModule: 'goal',
        activeTabRoute: store.activeTab?.route ?? null,
        formOpen: true,
        mode: state.mode,
        goalId: state.goalId,
        revision: state.revision,
        dirty: state.dirty,
        busy: state.busy,
        error: state.error ?? null,
        isControlled: true,
        controlledByMe: true,
        fields: {
          name: state.draft.name,
          summary: state.draft.summary || undefined,
          description: state.draft.description || undefined,
          status: state.draft.status,
          start: state.draft.start,
          target: state.draft.target,
          labelIds: state.draft.labelIds,
        },
        keyResults: state.draft.keyResults.map((kr, idx) => ({
          index: idx,
          id: kr.id,
          title: kr.title,
          description: kr.description || undefined,
          calculationMethod: kr.calculationMethod,
          initialValue: kr.initialValue,
          currentValue: kr.currentValue,
          targetValue: kr.targetValue,
          unit: kr.unit || undefined,
          weight: kr.weight,
        })),
        allowedActions: [
          'patch',
          'add_key_result',
          'remove_key_result',
          'focus',
          'submit',
          'release',
        ],
      });
    }

    const liveSession = goalSurface.locate();
    if (liveSession) {
      const state = liveSession.readDraftState();
      const isControlled = Boolean(store.businessControl);
      const controlledByMe = store.businessControl?.ownerId === ownerId;
      const allowedActions = isControlled
        ? controlledByMe
          ? ['patch', 'add_key_result', 'remove_key_result', 'focus', 'submit', 'release']
          : []
        : state.busy || state.dirty
          ? []
          : ['open'];

      return GoalPanelSnapshotSchema.parse({
        panelSurface: store.panelSurface,
        activeModule: 'goal',
        activeTabRoute: store.activeTab?.route ?? null,
        formOpen: true,
        mode: state.mode,
        goalId: state.goalId,
        revision: state.revision,
        dirty: state.dirty,
        busy: state.busy,
        error: state.error ?? null,
        isControlled,
        controlledByMe,
        fields: {
          name: state.draft.name,
          summary: state.draft.summary || undefined,
          description: state.draft.description || undefined,
          status: state.draft.status,
          start: state.draft.start,
          target: state.draft.target,
          labelIds: state.draft.labelIds,
        },
        keyResults: state.draft.keyResults.map((kr, idx) => ({
          index: idx,
          id: kr.id,
          title: kr.title,
          description: kr.description || undefined,
          calculationMethod: kr.calculationMethod,
          initialValue: kr.initialValue,
          currentValue: kr.currentValue,
          targetValue: kr.targetValue,
          unit: kr.unit || undefined,
          weight: kr.weight,
        })),
        allowedActions,
      });
    }

    const isControlled = Boolean(store.businessControl);
    const activeModule = store.activeTab ? moduleForPath(store.activeTab.route) : null;
    return GoalPanelSnapshotSchema.parse({
      panelSurface: store.panelSurface,
      activeModule,
      activeTabRoute: store.activeTab?.route ?? null,
      formOpen: false,
      mode: null,
      goalId: null,
      dirty: store.surfaceStatus === 'dirty',
      busy: store.surfaceStatus === 'busy',
      error: null,
      isControlled,
      controlledByMe: isControlled && store.businessControl?.ownerId === ownerId,
      allowedActions: !isControlled && store.surfaceStatus === 'clean' ? ['open'] : [],
    });
  }

  async function handleCommand(request: NativePanelIpcRequest): Promise<NativePanelIpcResponse> {
    const ownerId = `local-agent:${request.conversationId}:${request.runId}`;
    const cmd = request.command;

    try {
      switch (cmd.action) {
        case 'snapshot': {
          return {
            requestId: request.requestId,
            ok: true,
            snapshot: buildSnapshot(ownerId),
          };
        }
        case 'open': {
          try {
            await goalSurface.openControlled(ownerId, { mode: cmd.mode, goalId: cmd.goalId });
          } catch {
            return {
              requestId: request.requestId,
              ok: false,
              error: {
                code: 'BUSINESS_SURFACE_CONFLICT',
                message:
                  'Goal form is unavailable or has conflicting edits; inspect the current panel first.',
              },
              snapshot: buildSnapshot(ownerId),
            };
          }
          return {
            requestId: request.requestId,
            ok: true,
            snapshot: buildSnapshot(ownerId),
          };
        }
        case 'patch': {
          const session = goalSurface.getControlledSession(ownerId);
          if (!session) {
            return {
              requestId: request.requestId,
              ok: false,
              error: {
                code: 'PANEL_NOT_CONTROLLED',
                message: 'Goal panel is not under agent control',
              },
              snapshot: buildSnapshot(ownerId),
            };
          }
          const state = session.readDraftState();
          if (cmd.expectedRevision !== undefined && state.revision !== cmd.expectedRevision) {
            return {
              requestId: request.requestId,
              ok: false,
              error: {
                code: 'REVISION_CONFLICT',
                message: `Revision conflict: expected ${cmd.expectedRevision} but found ${state.revision}`,
              },
              snapshot: buildSnapshot(ownerId),
            };
          }
          session.patch(cmd);
          return {
            requestId: request.requestId,
            ok: true,
            snapshot: buildSnapshot(ownerId),
          };
        }
        case 'add_key_result': {
          const session = goalSurface.getControlledSession(ownerId);
          if (!session) {
            return {
              requestId: request.requestId,
              ok: false,
              error: {
                code: 'PANEL_NOT_CONTROLLED',
                message: 'Goal panel is not under agent control',
              },
              snapshot: buildSnapshot(ownerId),
            };
          }
          const state = session.readDraftState();
          if (cmd.expectedRevision !== undefined && state.revision !== cmd.expectedRevision) {
            return {
              requestId: request.requestId,
              ok: false,
              error: {
                code: 'REVISION_CONFLICT',
                message: `Revision conflict: expected ${cmd.expectedRevision} but found ${state.revision}`,
              },
              snapshot: buildSnapshot(ownerId),
            };
          }
          session.addChild(cmd.keyResult);
          return {
            requestId: request.requestId,
            ok: true,
            snapshot: buildSnapshot(ownerId),
          };
        }
        case 'remove_key_result': {
          const session = goalSurface.getControlledSession(ownerId);
          if (!session) {
            return {
              requestId: request.requestId,
              ok: false,
              error: {
                code: 'PANEL_NOT_CONTROLLED',
                message: 'Goal panel is not under agent control',
              },
              snapshot: buildSnapshot(ownerId),
            };
          }
          const state = session.readDraftState();
          if (cmd.expectedRevision !== undefined && state.revision !== cmd.expectedRevision) {
            return {
              requestId: request.requestId,
              ok: false,
              error: {
                code: 'REVISION_CONFLICT',
                message: `Revision conflict: expected ${cmd.expectedRevision} but found ${state.revision}`,
              },
              snapshot: buildSnapshot(ownerId),
            };
          }
          session.removeChild(cmd.index);
          return {
            requestId: request.requestId,
            ok: true,
            snapshot: buildSnapshot(ownerId),
          };
        }
        case 'focus': {
          const session = goalSurface.getControlledSession(ownerId);
          if (!session) {
            return {
              requestId: request.requestId,
              ok: false,
              error: {
                code: 'PANEL_NOT_CONTROLLED',
                message: 'Goal panel is not under agent control',
              },
              snapshot: buildSnapshot(ownerId),
            };
          }
          await session.focus(cmd.field);
          return {
            requestId: request.requestId,
            ok: true,
            snapshot: buildSnapshot(ownerId),
          };
        }
        case 'submit': {
          const session = goalSurface.getControlledSession(ownerId);
          if (!session) {
            return {
              requestId: request.requestId,
              ok: false,
              error: {
                code: 'PANEL_NOT_CONTROLLED',
                message: 'Goal panel is not under agent control',
              },
              snapshot: buildSnapshot(ownerId),
            };
          }
          const state = session.readDraftState();
          if (cmd.expectedRevision !== undefined && state.revision !== cmd.expectedRevision) {
            return {
              requestId: request.requestId,
              ok: false,
              error: {
                code: 'REVISION_CONFLICT',
                message: `Revision conflict: expected ${cmd.expectedRevision} but found ${state.revision}`,
              },
              snapshot: buildSnapshot(ownerId),
            };
          }
          const saved = await session.requestSubmit();
          if (!saved) {
            const latestState = session.readDraftState();
            return {
              requestId: request.requestId,
              ok: false,
              error: {
                code: 'VALIDATION_FAILED',
                message: latestState.error || 'Form validation failed',
              },
              snapshot: buildSnapshot(ownerId),
            };
          }
          return {
            requestId: request.requestId,
            ok: true,
            submitResult: {
              success: true,
              goalId: String(saved.id),
              goalUrl: `/goals/${saved.id}`,
              name: saved.name,
              version: saved.version,
              status: saved.status,
            },
            snapshot: buildSnapshot(ownerId),
          };
        }
        case 'release': {
          goalSurface.releaseControlledSession(ownerId);
          return {
            requestId: request.requestId,
            ok: true,
            snapshot: buildSnapshot(ownerId),
          };
        }
      }
    } catch {
      // Internal owner errors must not cross the agent-facing IPC boundary.
      return {
        requestId: request.requestId,
        ok: false,
        error: {
          code: 'PANEL_OPERATION_FAILED',
          message: 'Goal panel operation failed; inspect the current snapshot before retrying.',
        },
        snapshot: buildSnapshot(ownerId),
      };
    }
  }

  function setupIpc() {
    if (typeof window === 'undefined' || !(window as any).electronAPI) return;
    const api = (window as any).electronAPI;

    const listener = async (rawPayload: unknown) => {
      const parsed = NativePanelIpcRequestSchema.safeParse(rawPayload);
      if (!parsed.success) {
        const errorResp: NativePanelIpcResponse = {
          requestId: (rawPayload as any)?.requestId || 'unknown',
          ok: false,
          error: { code: 'INVALID_IPC_REQUEST', message: 'Invalid panel IPC request schema' },
        };
        void api.invoke(AIChannels.LOCAL_AGENT_PANEL_RESPONSE, errorResp).catch(() => {});
        return;
      }

      const response = await handleCommand(parsed.data);
      void api.invoke(AIChannels.LOCAL_AGENT_PANEL_RESPONSE, response).catch(() => {});
    };

    api.on(AIChannels.LOCAL_AGENT_PANEL_COMMAND, listener);

    return () => {
      api.off(AIChannels.LOCAL_AGENT_PANEL_COMMAND, listener);
    };
  }

  let cleanup: (() => void) | undefined;
  if (getCurrentInstance()) {
    onMounted(() => {
      cleanup = setupIpc();
    });

    onBeforeUnmount(() => {
      cleanup?.();
    });
  } else {
    cleanup = setupIpc();
  }

  return {
    handleCommand,
    buildSnapshot,
  };
}
