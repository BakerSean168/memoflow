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
});

it('logs a correlated cause reference without provider details or credential contents', () => {
  const log = vi.fn();
  const logger = new Logger('ExternalAgentDiagnostics', { level: 'error', transports: [{ name: 'capture', level: LogLevel.ERROR, log }] });
  const cause = new Error('Bearer private-credential and private query');
  createGatewayDiagnostics(logger)({ requestId: 'request-a', traceId: 'trace-a', cause });
  expect(log).toHaveBeenCalledTimes(1);
  const serialized = JSON.stringify(log.mock.calls);
  expect(serialized).toContain('request-a');
  expect(serialized).toContain('causeRef');
  expect(serialized).not.toContain('private-credential');
  expect(serialized).not.toContain('private query');
});
