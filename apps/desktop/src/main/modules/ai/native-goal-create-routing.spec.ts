import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { LocalAgentRepository, LocalAgentRuntime } from '@memoflow/ai';
import type { AssistantRuntimeEvent, NativePanelIpcResponse } from '@memoflow/ai-contracts';
import { createTimeContext } from '@memoflow/time';
import { createPowerSyncSqliteFixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import type { IDesktopNativePanelBridge } from './desktop-native-panel-bridge';
import { createDesktopLocalAgentTools } from './local-agent-tools';

const owner = 'IdentityId_00000000-0000-4000-8000-000000000736';

/**
 * #736 operator opt-in: the installed Codex CLI receives the screenshot request through the real
 * LocalAgentRuntime routing prompt and the real Desktop MCP tools. Only the Vue Goal owner session is
 * simulated, so the trace shows which MemoFlow tools the model actually chose. Runs a paid model turn.
 */
it.runIf(process.env.MEMOFLOW_REAL_CODEX_GOAL_ROUTE === '1')(
  'routes a plain Goal creation request to the native Goal form with no hidden owner write',
  async () => {
    const homePath = process.env.MEMOFLOW_CODEX_HOME;
    if (homePath !== undefined && !isAbsolute(homePath))
      throw new Error('MEMOFLOW_CODEX_HOME must be an absolute Codex home');
    const requestedModel = process.env.MEMOFLOW_CODEX_MODEL;
    if (!requestedModel) throw new Error('MEMOFLOW_CODEX_MODEL must name the exact native model');

    const fixture = createPowerSyncSqliteFixture();
    const store = new LocalAgentRepository(fixture.db);
    const panelActions: string[] = [];
    let opened = false;
    let revision = 0;
    const panelBridge: IDesktopNativePanelBridge = {
      executeCommand: vi.fn(async (_context, command): Promise<NativePanelIpcResponse> => {
        panelActions.push(command.action);
        if (command.action === 'open') opened = true;
        if (command.action !== 'snapshot' && command.action !== 'focus') revision++;
        const submitted = command.action === 'submit';
        return {
          requestId: randomUUID(),
          ok: true,
          ...(submitted
            ? {
                submitResult: {
                  success: true,
                  goalId: 'IGoalId_00000000-0000-4000-8000-000000000736',
                  goalUrl: '/goals/IGoalId_00000000-0000-4000-8000-000000000736',
                  name: 'Read six books in three months',
                  version: 1,
                  status: 'Planned',
                },
              }
            : {}),
          snapshot: {
            panelSurface: 'business',
            activeModule: 'goal',
            activeTabRoute: '/goals',
            formOpen: opened,
            mode: opened ? 'create' : null,
            goalId: null,
            revision,
            dirty: opened && !submitted,
            busy: false,
            error: null,
            isControlled: opened,
            controlledByMe: opened,
            allowedActions: opened
              ? ['patch', 'add_key_result', 'remove_key_result', 'focus', 'submit', 'release']
              : ['open'],
          },
        };
      }),
      releaseAllForRun: vi.fn(),
    };
    const bridge = createDesktopLocalAgentTools(
      fixture.db,
      store,
      () => true,
      {
        getUserTimeContext: async () =>
          createTimeContext({ timeZone: 'Asia/Shanghai', weekStartsOn: 1 }),
      },
      undefined,
      panelBridge,
    );
    const cwd = await mkdtemp(join(tmpdir(), 'memoflow-goal-route-'));
    const runtime = new LocalAgentRuntime({ store, bridge, cwd });
    const trace: string[] = [];
    try {
      const connection = await runtime.saveConnection(owner, {
        driver: 'codex',
        name: 'Real Codex Goal route',
        executablePath: process.env.MEMOFLOW_CODEX_EXECUTABLE ?? 'codex',
        enabled: true,
        writeScopes: ['goals:write'],
        ...(homePath ? { homePath } : {}),
      });
      const status = await runtime.probeConnection(owner, connection.id);
      if (status.status !== 'ready')
        throw new Error(`Installed codex unavailable: ${JSON.stringify(status)}`);
      const model = status.models.find((candidate) => candidate.id === requestedModel);
      if (!model) throw new Error(`Requested model ${requestedModel} is not in the native catalog`);
      const conversation = await runtime.createConversation(owner, {
        connectionId: connection.id,
        modelId: model.id,
        name: 'Goal route acceptance',
      });
      const events: AssistantRuntimeEvent[] = [];
      for await (const event of runtime.dispatchMessage({
        identityId: owner,
        conversationId: conversation.id,
        content: '帮我创建一个目标：三个月内读完 6 本书，每个月读 2 本。',
        signal: AbortSignal.timeout(300_000),
      })) {
        events.push(event);
        if (event.type === 'assistant.activity') trace.push(`activity ${event.data.label}`);
        if (event.type === 'assistant.run.failed')
          trace.push(`failed ${JSON.stringify(event.data)}`);
        if (event.type === 'assistant.request.required' && event.data.type === 'permission') {
          // Approve MemoFlow Goal tools only, so the trace shows the model's own choice.
          const memoflowGoalTool = /goal_(?:panel_[a-z_]+|create)/.test(event.data.title);
          trace.push(
            `permission ${event.data.title} -> ${memoflowGoalTool ? 'approve' : 'decline'}`,
          );
          runtime.respond(owner, {
            conversationId: conversation.id,
            runId: event.runId,
            requestId: event.data.requestId,
            response: {
              type: 'permission',
              decision: memoflowGoalTool ? 'approve_once' : 'decline',
            },
          });
        }
      }
      const history = await runtime.listMessages({
        identityId: owner,
        conversationId: conversation.id,
      });
      trace.push(`panel ${panelActions.join(' > ') || '(none)'}`);
      trace.push(`reply ${history.messages.at(-1)?.content.slice(0, 400) ?? ''}`);
      console.info(`[#736 goal route trace]\n${trace.join('\n')}`);
      expect(events.at(-1)?.type).toBe('assistant.run.completed');
      expect(panelActions).toContain('open');
      expect(fixture.sql.prepare('SELECT COUNT(*) AS n FROM goals').get()).toMatchObject({ n: 0 });
    } finally {
      await runtime.dispose();
      await bridge.dispose();
      fixture.close();
      await rm(cwd, { recursive: true, force: true });
    }
  },
  360_000,
);
