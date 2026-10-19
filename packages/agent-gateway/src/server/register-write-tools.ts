import {
  GatewayRoutineReceiptSchema,
  GatewayGoalReceiptSchema,
  GatewayTaskReceiptSchema,
} from '@memoflow/contracts/agent-gateway';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { writeToolDescriptors } from '../write-tool-descriptors';
import type { GatewayWritePort, GatewayWriteAuthority } from '../ports';
import type { ReadToolCall } from './register-read-tools';
export function registerWriteTools(
  server: McpServer,
  writes: GatewayWritePort,
  context: ExecutionContext,
  scopes: readonly string[],
  authority: GatewayWriteAuthority,
  call: ReadToolCall,
) {
  const d = writeToolDescriptors;
  const routineCreate = writes.routineCreate;
  if (routineCreate && scopes.includes('routines:write')) {
    server.registerTool('routine_create', d.routine_create.definition, (input) =>
      call('routine_create', 'routines:write', () =>
        routineCreate(input, context, authority).then((result) =>
          GatewayRoutineReceiptSchema.parse(result),
        ),
      ),
    );
  }
  if (scopes.includes('goals:write')) {
    server.registerTool('goal_create', d.goal_create.definition, (input) =>
      call('goal_create', 'goals:write', () =>
        writes
          .goalCreate(input, context, authority)
          .then((result) => GatewayGoalReceiptSchema.parse(result)),
      ),
    );
    server.registerTool('goal_update', d.goal_update.definition, (input) =>
      call('goal_update', 'goals:write', () =>
        writes
          .goalUpdate(input, context, authority)
          .then((result) => GatewayGoalReceiptSchema.parse(result)),
      ),
    );
    server.registerTool('goal_key_result_create', d.goal_key_result_create.definition, (input) =>
      call('goal_key_result_create', 'goals:write', () =>
        writes
          .keyResultCreate(input, context, authority)
          .then((result) => GatewayGoalReceiptSchema.parse(result)),
      ),
    );
    server.registerTool('goal_key_result_update', d.goal_key_result_update.definition, (input) =>
      call('goal_key_result_update', 'goals:write', () =>
        writes
          .keyResultUpdate(input, context, authority)
          .then((result) => GatewayGoalReceiptSchema.parse(result)),
      ),
    );
  }
  if (scopes.includes('tasks:write')) {
    server.registerTool('task_plan_create', d.task_plan_create.definition, (input) =>
      call('task_plan_create', 'tasks:write', () =>
        writes
          .taskCreate(input, context, authority)
          .then((result) => GatewayTaskReceiptSchema.parse(result)),
      ),
    );
    server.registerTool('task_plan_update', d.task_plan_update.definition, (input) =>
      call('task_plan_update', 'tasks:write', () =>
        writes
          .taskUpdate(input, context, authority)
          .then((result) => GatewayTaskReceiptSchema.parse(result)),
      ),
    );
    server.registerTool(
      'task_occurrence_complete',
      d.task_occurrence_complete.definition,
      (input) =>
        call('task_occurrence_complete', 'tasks:write', () =>
          writes
            .taskComplete(input, context, authority)
            .then((result) => GatewayTaskReceiptSchema.parse(result)),
        ),
    );
  }
}
