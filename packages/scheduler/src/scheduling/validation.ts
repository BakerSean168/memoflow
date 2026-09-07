import type { ScheduledIntent, SchedulingOwner, SchedulingRetryPolicy } from './contracts';

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const HANDLER_KEY = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export class DuplicateSchedulingKeyError extends TypeError {
  constructor(public readonly schedulingKey: string) {
    super(`Duplicate schedulingKey in desired set: ${schedulingKey}`);
    this.name = 'DuplicateSchedulingKeyError';
  }
}

function assertStableText(value: string, label: string, maxLength: number): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  if (value !== value.trim()) {
    throw new TypeError(`${label} must not contain leading or trailing whitespace.`);
  }
  if (value.length > maxLength) {
    throw new TypeError(`${label} must be at most ${maxLength} characters.`);
  }
  if (CONTROL_CHARACTER.test(value)) {
    throw new TypeError(`${label} must not contain control characters.`);
  }
}

export function assertSchedulingOwner(owner: SchedulingOwner): void {
  if (!owner || typeof owner !== 'object') {
    throw new TypeError('Scheduling owner is required.');
  }
  assertStableText(owner.identityId, 'Scheduling owner identityId', 256);
  assertStableText(owner.type, 'Scheduling owner type', 128);
  assertStableText(owner.id, 'Scheduling owner id', 256);
}

export function assertSchedulingKey(schedulingKey: string): void {
  assertStableText(schedulingKey, 'schedulingKey', 512);
}

export function assertHandlerKey(handlerKey: string): void {
  assertStableText(handlerKey, 'handlerKey', 160);
  if (!HANDLER_KEY.test(handlerKey)) {
    throw new TypeError(
      'handlerKey must be a stable lowercase key such as "task.reminder.fire".',
    );
  }
}

export function assertPayloadVersion(payloadVersion: number): void {
  if (!Number.isSafeInteger(payloadVersion) || payloadVersion < 1) {
    throw new TypeError('payloadVersion must be a positive safe integer.');
  }
}

function assertRetryPolicy(policy: SchedulingRetryPolicy): void {
  if (!Number.isSafeInteger(policy.maxRetries) || policy.maxRetries < 0) {
    throw new TypeError('retryPolicy.maxRetries must be a non-negative safe integer.');
  }
  if (!Number.isFinite(policy.initialDelayMs) || policy.initialDelayMs < 0) {
    throw new TypeError('retryPolicy.initialDelayMs must be non-negative.');
  }
  if (!Number.isFinite(policy.maxDelayMs) || policy.maxDelayMs < policy.initialDelayMs) {
    throw new TypeError('retryPolicy.maxDelayMs must be >= initialDelayMs.');
  }
  if (!Number.isFinite(policy.backoffMultiplier) || policy.backoffMultiplier < 1) {
    throw new TypeError('retryPolicy.backoffMultiplier must be >= 1.');
  }
}

export function assertScheduledIntent(intent: ScheduledIntent): void {
  if (!intent || typeof intent !== 'object') {
    throw new TypeError('Scheduled intent is required.');
  }
  assertSchedulingKey(intent.schedulingKey);
  assertHandlerKey(intent.handlerKey);
  assertPayloadVersion(intent.payloadVersion);
  if (!Number.isFinite(intent.runAt)) {
    throw new TypeError('runAt must be a finite Instant (epoch milliseconds).');
  }
  if (intent.retryPolicy) {
    assertRetryPolicy(intent.retryPolicy);
  }
  if (intent.timeoutMs !== undefined && intent.timeoutMs !== null) {
    if (!Number.isFinite(intent.timeoutMs) || intent.timeoutMs < 0) {
      throw new TypeError('timeoutMs must be null or a non-negative finite number.');
    }
  }
  if (intent.observability?.name !== undefined) {
    assertStableText(intent.observability.name, 'observability.name', 256);
  }
  for (const tag of intent.observability?.tags ?? []) {
    assertStableText(tag, 'observability.tags[]', 128);
  }
}

export function assertUniqueSchedulingKeys(desired: readonly ScheduledIntent[]): void {
  const seen = new Set<string>();
  for (const intent of desired) {
    assertScheduledIntent(intent);
    if (seen.has(intent.schedulingKey)) {
      throw new DuplicateSchedulingKeyError(intent.schedulingKey);
    }
    seen.add(intent.schedulingKey);
  }
}
