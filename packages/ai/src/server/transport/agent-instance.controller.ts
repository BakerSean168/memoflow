import { fail, ok, type Result } from '@memoflow/contracts/result';
import {
  AgentRegistryCommandSchema,
  type AgentInstance,
  type AgentRegistrySnapshot,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { AgentInstanceRegistry } from '../application/agent-instance/agent-instance.registry';
import { AgentRegistryError } from '../application/agent-instance/agent-instance.repository';

/** Reused by authenticated HTTP and Desktop IPC. Owner is always injected by the host. */
export class AgentInstanceController {
  constructor(private readonly registry: AgentInstanceRegistry | null | undefined) {}

  async list(cx: ExecutionContext): Promise<Result<AgentRegistrySnapshot>> {
    if (!this.registry)
      return fail({ code: 'SERVICE_UNAVAILABLE', message: 'Agent registry is unavailable' });
    try {
      return ok(await this.registry.list(cx.identityId));
    } catch (cause) {
      return this.failure(cause);
    }
  }
  async execute(
    input: unknown,
    cx: ExecutionContext,
  ): Promise<Result<AgentInstance | AgentRegistrySnapshot | null>> {
    if (!this.registry)
      return fail({ code: 'SERVICE_UNAVAILABLE', message: 'Agent registry is unavailable' });
    const command = AgentRegistryCommandSchema.safeParse(input);
    if (!command.success)
      return fail({ code: 'VALIDATION_ERROR', message: 'Invalid Agent registry command' });
    try {
      return ok(await this.registry.execute(cx.identityId, command.data));
    } catch (cause) {
      return this.failure(cause);
    }
  }
  private failure<T>(cause: unknown): Result<T> {
    if (cause instanceof AgentRegistryError) {
      const code = cause.code === 'AI_CONFIGURATION_REQUIRED' ? 'VALIDATION_ERROR' : cause.code;
      return fail({ code, message: cause.message });
    }
    return fail({ code: 'INTERNAL_ERROR', message: 'Agent registry operation failed' });
  }
}
