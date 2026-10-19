import type { McpServer } from '@modelcontextprotocol/server';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { GatewayAssistedPort, GatewayWriteAuthority } from '../ports';
import { assistedToolDescriptors } from '../assisted-tool-descriptors';
import type { ReadToolCall } from './register-read-tools';

export function registerAssistedTools(
  server: McpServer,
  assisted: GatewayAssistedPort,
  context: ExecutionContext,
  authority: GatewayWriteAuthority,
  call: ReadToolCall,
) {
  if (!authority.scopes.includes('tasks:write')) return;
  server.registerTool(
    'assisted_workflow_start',
    assistedToolDescriptors.assisted_workflow_start.definition,
    (input) =>
      call('assisted_workflow_start', 'tasks:write', () =>
        assisted.start(input, context, authority),
      ),
  );
  server.registerTool(
    'assisted_workflow_get',
    assistedToolDescriptors.assisted_workflow_get.definition,
    (input) =>
      call('assisted_workflow_get', 'tasks:write', () => assisted.get(input, context, authority)),
  );
  server.registerTool(
    'assisted_workflow_review',
    assistedToolDescriptors.assisted_workflow_review.definition,
    (input) =>
      call('assisted_workflow_review', 'tasks:write', () =>
        assisted.review(input, context, authority),
      ),
  );
  server.registerTool(
    'assisted_workflow_resume',
    assistedToolDescriptors.assisted_workflow_resume.definition,
    (input) =>
      call('assisted_workflow_resume', 'tasks:write', () =>
        assisted.resume(input, context, authority),
      ),
  );
  server.registerTool(
    'assisted_workflow_cancel',
    assistedToolDescriptors.assisted_workflow_cancel.definition,
    (input) =>
      call('assisted_workflow_cancel', 'tasks:write', () =>
        assisted.cancel(input, context, authority),
      ),
  );
}
