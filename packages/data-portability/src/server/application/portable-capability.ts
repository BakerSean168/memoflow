import type { PortableCapabilityKey } from '@memoflow/contracts/data-portability';
import { PortableCapabilityKeySchema } from '@memoflow/contracts/data-portability';
import type { z } from 'zod';
import type { PortableReferenceRegistry } from './portable-reference-registry';

export interface PortableCapabilityExecutionContext {
  readonly identityId: string;
  readonly batchId?: string;
  readonly references: PortableReferenceRegistry;
}

export interface PortableCapabilityReceipt {
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  readonly warnings: readonly string[];
}

/**
 * Owner-module contract for one portable business capability.
 *
 * The owner exposes its canonical payload schema and receives only payloads
 * that have passed that schema. The orchestration package never interprets
 * the owner's product shape.
 */
export interface PortableCapability<TPayload> {
  readonly key: PortableCapabilityKey;
  readonly schemaVersion: number;
  readonly dependsOn?: readonly PortableCapabilityKey[];
  readonly payloadSchema: z.ZodType<TPayload>;

  export(context: PortableCapabilityExecutionContext): Promise<TPayload | null>;
  dryRun(
    payload: TPayload,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt>;
  apply(
    payload: TPayload,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt>;
}

export interface RegisteredPortableCapability {
  readonly key: PortableCapabilityKey;
  readonly schemaVersion: number;
  readonly dependsOn: readonly PortableCapabilityKey[];
  validatePayload(payload: unknown): unknown;
  exportValidated(context: PortableCapabilityExecutionContext): Promise<unknown | null>;
  dryRunValidated(
    payload: unknown,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt>;
  applyValidated(
    payload: unknown,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt>;
}

/**
 * Typed registration seam used by host composition roots.
 *
 * The registry intentionally erases payload types only after registration;
 * every ingress/egress path re-validates through the owner-provided Zod
 * schema before orchestration can continue.
 */
export class PortableCapabilityRegistry {
  private readonly capabilities = new Map<PortableCapabilityKey, RegisteredPortableCapability>();

  register<TPayload>(capability: PortableCapability<TPayload>): void {
    const keyResult = PortableCapabilityKeySchema.safeParse(capability.key);
    if (!keyResult.success) {
      throw new Error(`Invalid portable capability key: ${String(capability.key)}`);
    }
    if (!Number.isInteger(capability.schemaVersion) || capability.schemaVersion <= 0) {
      throw new Error(`Invalid schema version for portable capability ${capability.key}`);
    }
    if (this.capabilities.has(capability.key)) {
      throw new Error(`Portable capability already registered: ${capability.key}`);
    }

    const dependsOn = [...(capability.dependsOn ?? [])];
    if (dependsOn.includes(capability.key)) {
      throw new Error(`Portable capability cannot depend on itself: ${capability.key}`);
    }
    for (const dependency of dependsOn) {
      if (!PortableCapabilityKeySchema.safeParse(dependency).success) {
        throw new Error(`Invalid dependency key for portable capability ${capability.key}`);
      }
    }

    const parsePayload = (payload: unknown): TPayload => {
      const result = capability.payloadSchema.safeParse(payload);
      if (!result.success) {
        throw new Error(
          `Portable capability payload validation failed for ${capability.key}@${capability.schemaVersion}: ${result.error.issues[0]?.message ?? 'invalid payload'}`,
        );
      }
      return result.data;
    };

    this.capabilities.set(capability.key, {
      key: capability.key,
      schemaVersion: capability.schemaVersion,
      dependsOn,
      validatePayload(payload) {
        return parsePayload(payload);
      },
      async exportValidated(context) {
        const payload = await capability.export(context);
        return payload === null ? null : parsePayload(payload);
      },
      async dryRunValidated(payload, context) {
        return capability.dryRun(parsePayload(payload), context);
      },
      async applyValidated(payload, context) {
        return capability.apply(parsePayload(payload), context);
      },
    });
  }

  get(key: PortableCapabilityKey): RegisteredPortableCapability | undefined {
    return this.capabilities.get(key);
  }

  list(): readonly RegisteredPortableCapability[] {
    return [...this.capabilities.values()];
  }

  resolveDependencyOrder(
    requestedKeys?: readonly PortableCapabilityKey[],
    options: { readonly requireExplicitDependencies?: boolean } = {},
  ): readonly RegisteredPortableCapability[] {
    const requested = requestedKeys ?? this.list().map((capability) => capability.key);
    const explicit = new Set(requested);
    const permanent = new Set<PortableCapabilityKey>();
    const temporary = new Set<PortableCapabilityKey>();
    const ordered: RegisteredPortableCapability[] = [];

    const visit = (key: PortableCapabilityKey, path: readonly PortableCapabilityKey[]): void => {
      if (permanent.has(key)) return;
      if (temporary.has(key)) {
        throw new Error(`Portable capability dependency cycle: ${[...path, key].join(' -> ')}`);
      }
      const capability = this.capabilities.get(key);
      if (!capability) {
        throw new Error(`Portable capability is not registered: ${key}`);
      }
      temporary.add(key);
      for (const dependency of capability.dependsOn) {
        if (options.requireExplicitDependencies && !explicit.has(dependency)) {
          throw new Error(`Portable capability ${key} requires missing payload dependency ${dependency}`);
        }
        visit(dependency, [...path, key]);
      }
      temporary.delete(key);
      permanent.add(key);
      ordered.push(capability);
    };

    for (const key of requested) visit(key, []);
    return ordered;
  }
}
