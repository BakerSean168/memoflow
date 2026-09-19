import type {
  NotificationActionIntent,
  NotificationEntityRef,
} from '@memoflow/contracts/notification';
import type { JsonValue } from '@memoflow/contracts/result';

interface InputSchema<T> {
  parse(value: unknown): T;
}

export interface NotificationOwnerCommandInvocation<TInput = JsonValue | undefined> {
  readonly identityId: string;
  readonly notificationId: string;
  readonly workflowKey: string;
  readonly actionKey: string;
  readonly owner: NotificationEntityRef;
  readonly commandKey: string;
  readonly input: TInput;
  readonly idempotencyKey: string;
  readonly correlationId?: string | null;
  readonly causationId?: string | null;
}

export interface NotificationOwnerCommandReceipt {
  readonly outcome: 'accepted' | 'rejected';
  readonly commandReceiptId?: string | null;
  readonly reason?: string;
}

export interface NotificationOwnerCommandRegistration<TInput = JsonValue | undefined> {
  readonly workflowKey: string;
  readonly ownerType: string;
  readonly commandKey: string;
  readonly inputSchema?: InputSchema<TInput>;
  readonly execute: (
    invocation: NotificationOwnerCommandInvocation<TInput>,
  ) => Promise<NotificationOwnerCommandReceipt>;
}

export interface NotificationOwnerCommandPort {
  execute(input: {
    readonly identityId: string;
    readonly notificationId: string;
    readonly workflowKey: string;
    readonly action: Extract<NotificationActionIntent, { kind: 'owner-command' }>;
    readonly idempotencyKey: string;
    readonly correlationId?: string | null;
    readonly causationId?: string | null;
  }): Promise<NotificationOwnerCommandReceipt>;
}

function registryKey(workflowKey: string, ownerType: string, commandKey: string): string {
  return `${workflowKey}\u0000${ownerType}\u0000${commandKey}`;
}

/** Explicit owner-command allowlist. Unknown workflow/owner/command combinations fail closed. */
export class NotificationOwnerCommandRegistry implements NotificationOwnerCommandPort {
  private readonly registrations = new Map<string, NotificationOwnerCommandRegistration<unknown>>();

  register<TInput>(registration: NotificationOwnerCommandRegistration<TInput>): () => void {
    const key = registryKey(
      registration.workflowKey,
      registration.ownerType,
      registration.commandKey,
    );
    if (this.registrations.has(key)) {
      throw new Error(`Notification owner command already registered: ${registration.workflowKey}/${registration.ownerType}/${registration.commandKey}`);
    }
    this.registrations.set(key, registration as NotificationOwnerCommandRegistration<unknown>);
    return () => {
      if (this.registrations.get(key) === registration) this.registrations.delete(key);
    };
  }

  async execute(input: {
    readonly identityId: string;
    readonly notificationId: string;
    readonly workflowKey: string;
    readonly action: Extract<NotificationActionIntent, { kind: 'owner-command' }>;
    readonly idempotencyKey: string;
    readonly correlationId?: string | null;
    readonly causationId?: string | null;
  }): Promise<NotificationOwnerCommandReceipt> {
    const key = registryKey(input.workflowKey, input.action.owner.type, input.action.commandKey);
    const registration = this.registrations.get(key);
    if (!registration) {
      return { outcome: 'rejected', reason: 'owner-command-not-registered' };
    }

    let parsedInput: unknown = input.action.input;
    try {
      if (registration.inputSchema) parsedInput = registration.inputSchema.parse(input.action.input);
    } catch {
      return { outcome: 'rejected', reason: 'owner-command-input-invalid' };
    }

    return registration.execute({
      identityId: input.identityId,
      notificationId: input.notificationId,
      workflowKey: input.workflowKey,
      actionKey: input.action.actionKey,
      owner: input.action.owner,
      commandKey: input.action.commandKey,
      input: parsedInput,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      causationId: input.causationId,
    });
  }
}
