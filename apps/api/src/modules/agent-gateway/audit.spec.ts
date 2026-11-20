import { describe, expect, it, vi } from 'vitest';
import { Logger, LogLevel } from '@memoflow/utils/logger';
import { createGatewayAudit, createGatewayDiagnostics } from './audit';

describe('External agent audit visibility', () => {
  it('retains read audit when diagnostic logging is warn without changing other loggers', () => {
    const log = vi.fn();
    const transport = { name: 'capture', level: LogLevel.INFO, log };
    const diagnostic = new Logger('API', { level: 'warn', transports: [transport] });
    const dedicated = new Logger('ExternalAgentAudit', { level: 'warn', transports: [transport] });
    const audit = createGatewayAudit(dedicated);
    diagnostic.info('Suppressed diagnostic');
    audit({
      version: '1',
      effect: 'read',
      scopeDecision: 'denied',
      requestId: 'request-a',
      traceId: 'trace-a',
      tool: 'transport',
      outcome: 'INVALID_CREDENTIAL',
      durationMs: 1,
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ message: 'External agent audit' }));
  });

  it('enqueues the durable copy beside the synchronous log write', () => {
    const log = vi.fn();
    const record = vi.fn();
    const logger = new Logger('ExternalAgentAudit', {
      level: 'warn',
      transports: [{ name: 'capture', level: LogLevel.INFO, log }],
    });
    createGatewayAudit(logger, { record })({
      version: '1',
      effect: 'write',
      scopeDecision: 'allowed',
      requestId: 'request-a',
      traceId: 'trace-a',
      credentialId: 'credential-a',
      identityId: 'owner-a',
      tool: 'goal_create',
      receiptId: 'receipt-a',
      replayed: false,
      outcome: 'OK',
      durationMs: 5,
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-a', receiptId: 'receipt-a' }),
    );
  });

  it('keeps the log copy when the durable writer is unavailable', () => {
    const log = vi.fn();
    const logger = new Logger('ExternalAgentAudit', {
      level: 'warn',
      transports: [{ name: 'capture', level: LogLevel.INFO, log }],
    });
    expect(() =>
      createGatewayAudit(logger, {
        record: () => {
          throw new Error('audit store closed');
        },
      })({
        version: '1',
        effect: 'read',
        scopeDecision: 'denied',
        requestId: 'request-a',
        traceId: 'trace-a',
        tool: 'transport',
        outcome: 'INVALID_CREDENTIAL',
        durationMs: 1,
      }),
    ).not.toThrow();
    expect(log).toHaveBeenCalledTimes(1);
  });
});

it('logs a correlated cause reference without provider details or credential contents', () => {
  const log = vi.fn();
  const logger = new Logger('ExternalAgentDiagnostics', {
    level: 'error',
    transports: [{ name: 'capture', level: LogLevel.ERROR, log }],
  });
  const cause = new Error('Bearer private-credential and private query');
  createGatewayDiagnostics(logger)({ requestId: 'request-a', traceId: 'trace-a', cause });
  expect(log).toHaveBeenCalledTimes(1);
  const serialized = JSON.stringify(log.mock.calls);
  expect(serialized).toContain('request-a');
  expect(serialized).toContain('causeRef');
  expect(serialized).not.toContain('private-credential');
  expect(serialized).not.toContain('private query');
});
