import type {
  ScheduledHandlerRegistration,
  ScheduledHandlerResult,
  ScheduledInvocationContext,
} from './contracts';
import { assertHandlerKey, assertPayloadVersion } from './validation';

export class DuplicateScheduledHandlerError extends Error {
  constructor(public readonly handlerKey: string) {
    super(`Scheduled handler key is already registered: ${handlerKey}`);
    this.name = 'DuplicateScheduledHandlerError';
  }
}

type AnyRegistration = ScheduledHandlerRegistration<unknown>;

/**
 * Feature-neutral runtime registry. It knows handler keys and payload schemas,
 * but never imports Goal/Task/Routine/Notification domains.
 */
export class ScheduledHandlerRegistry {
  private readonly registrations = new Map<string, AnyRegistration>();

  register<TPayload>(registration: ScheduledHandlerRegistration<TPayload>): void {
    assertHandlerKey(registration.handlerKey);
    assertPayloadVersion(registration.payloadVersion);
    if (this.registrations.has(registration.handlerKey)) {
      throw new DuplicateScheduledHandlerError(registration.handlerKey);
    }
    this.registrations.set(
      registration.handlerKey,
      registration as unknown as AnyRegistration,
    );
  }

  has(handlerKey: string): boolean {
    return this.registrations.has(handlerKey);
  }

  keys(): readonly string[] {
    return [...this.registrations.keys()].sort();
  }

  async execute(invocation: ScheduledInvocationContext): Promise<ScheduledHandlerResult> {
    const registration = this.registrations.get(invocation.handlerKey);
    if (!registration) {
      return {
        status: 'dead_letter',
        failure: {
          code: 'UNKNOWN_HANDLER',
          message: `No scheduled handler is registered for key: ${invocation.handlerKey}`,
          retryable: false,
        },
      };
    }

    if (invocation.payloadVersion !== registration.payloadVersion) {
      return {
        status: 'dead_letter',
        failure: {
          code: 'UNSUPPORTED_PAYLOAD_VERSION',
          message:
            `Handler ${invocation.handlerKey} expects payloadVersion ` +
            `${registration.payloadVersion}, received ${invocation.payloadVersion}.`,
          retryable: false,
        },
      };
    }

    let payload: unknown;
    try {
      payload = registration.validatePayload(invocation.payload);
    } catch (error) {
      return {
        status: 'dead_letter',
        failure: {
          code: 'PAYLOAD_VALIDATION_FAILED',
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        },
      };
    }

    try {
      return await registration.handler.execute({ ...invocation, payload });
    } catch (error) {
      return {
        status: 'retryable',
        failure: {
          code: 'HANDLER_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        },
      };
    }
  }
}
