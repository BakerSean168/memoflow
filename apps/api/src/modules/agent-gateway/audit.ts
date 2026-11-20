import { createHash } from 'node:crypto';
import type { ILogger } from '@memoflow/utils/logger';
import type { GatewayAuditEvent, GatewayDiagnostic } from '@memoflow/agent-gateway';

/** Synchronous seam for the durable audit copy; the concrete writer is batched. */
export interface GatewayAuditPersistence {
  record(event: GatewayAuditEvent): void;
}

/**
 * Keeps credential/read audit enabled independently of the host diagnostic level.
 * The log write stays synchronous; the durable copy is only enqueued so the
 * request's terminal path never awaits PostgreSQL.
 * @param logger - A dedicated provider-backed logger, never the shared API logger.
 * @param persistence - Optional bounded, batched durable sink.
 * @returns The minimal structured audit sink.
 */
export function createGatewayAudit(
  logger: ILogger,
  persistence?: GatewayAuditPersistence,
): (event: GatewayAuditEvent) => void {
  logger.setLevel('info');
  return (event) => {
    logger.info('External agent audit', { ...event });
    try {
      persistence?.record(event);
    } catch {
      /* The log copy above already retains the event. */
    }
  };
}

/**
 * Keeps a stable internal cause reference without logging provider messages or payloads.
 * @param logger - Dedicated internal diagnostic sink.
 * @returns Private cause observer with safe correlated logging.
 */
export function createGatewayDiagnostics(logger: ILogger): (event: GatewayDiagnostic) => void {
  return ({ requestId, traceId, cause }) => {
    const error = cause instanceof Error ? cause : new Error('Non-Error failure');
    const causeRef = createHash('sha256')
      .update(error.name + ':' + error.message + ':' + (error.stack ?? ''))
      .digest('hex');
    const classification =
      error instanceof TypeError
        ? 'TypeError'
        : error instanceof RangeError
          ? 'RangeError'
          : 'Error';
    const frames = (error.stack ?? '')
      .split('\n')
      .filter((line) => /^\s+at /.test(line))
      .map((line) => line.match(/(?:\/[^\s()]+\.[cm]?[jt]s:\d+:\d+)/)?.[0])
      .filter((line): line is string => Boolean(line))
      .slice(0, 8);
    logger.error('External agent internal failure', {
      causeRef,
      classification,
      frames,
      requestId,
      traceId,
    });
  };
}
