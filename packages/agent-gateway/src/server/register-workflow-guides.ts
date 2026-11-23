import type { McpServer } from '@modelcontextprotocol/server';
import { memorySkillFiles, SkillsExtension } from '@modelcontextprotocol/server/ext/skills';
import {
  GOAL_PLANNING_SKILL,
  GOAL_PLANNING_SKILL_URI,
  workflowGuideToolDescriptor,
} from '../workflow-guides';

// An immutable memory catalog works in Electron bundles and per-request HTTP servers.
const catalog = SkillsExtension.load(
  memorySkillFiles({ 'goal-planning/SKILL.md': GOAL_PLANNING_SKILL }),
  { strict: true },
);

export async function registerWorkflowGuides(
  server: McpServer,
  onRead?: () => void,
): Promise<void> {
  (await catalog).attach(server);
  server.registerTool('workflow_guide_get', workflowGuideToolDescriptor.definition, () => {
    onRead?.();
    return {
      content: [{ type: 'text' as const, text: GOAL_PLANNING_SKILL }],
      structuredContent: {
        guide: 'goal-planning',
        uri: GOAL_PLANNING_SKILL_URI,
        markdown: GOAL_PLANNING_SKILL,
      },
    };
  });
}
