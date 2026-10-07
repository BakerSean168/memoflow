import {
  createPublicFailure,
  createPublicFailureSchema,
  defineFailureRegistry,
  EmptyFailureDetailsSchema,
  type PublicFailureOf,
} from '../../result';

/** Management operations never automatically replay consent or credential mutations. */
const management = {
  operations: [
    'capabilities',
    'consentRequest',
    'decideConsent',
    'listConnections',
    'revokeConnection',
    'listPats',
    'createPat',
    'revokePat',
  ],
  operationPolicy: 'manual-only',
  introducedIn: '0.15.0',
  test: 'packages/cloud-auth/src/client/external-agent-client.spec.ts',
  details: EmptyFailureDetailsSchema,
} as const;

export const ExternalAgentFailureRegistry = defineFailureRegistry({
  EAG_UNAUTHORIZED: {
    ...management,
    category: 'unauthenticated',
    retryHint: { kind: 'not_retryable' },
    telemetry: 'external_agent.eag_unauthorized',
    i18n: 'errors.EAG_UNAUTHORIZED',
    http: 401,
  },
  EAG_FORBIDDEN: {
    ...management,
    category: 'permission',
    retryHint: { kind: 'not_retryable' },
    telemetry: 'external_agent.eag_forbidden',
    i18n: 'errors.EAG_FORBIDDEN',
    http: 403,
  },
  EAG_CONSENT_INVALID: {
    ...management,
    category: 'validation',
    retryHint: { kind: 'not_retryable' },
    telemetry: 'external_agent.eag_consent_invalid',
    i18n: 'errors.EAG_CONSENT_INVALID',
    http: 400,
  },
  EAG_VALIDATION_ERROR: {
    ...management,
    category: 'validation',
    retryHint: { kind: 'not_retryable' },
    telemetry: 'external_agent.eag_validation_error',
    i18n: 'errors.EAG_VALIDATION_ERROR',
    http: 400,
  },
  EAG_SERVICE_DISABLED: {
    ...management,
    category: 'unavailable',
    retryHint: { kind: 'not_retryable' },
    telemetry: 'external_agent.eag_service_disabled',
    i18n: 'errors.EAG_SERVICE_DISABLED',
    http: 404,
  },
  EAG_RATE_LIMITED: {
    ...management,
    category: 'rate_limited',
    retryHint: { kind: 'transient' },
    telemetry: 'external_agent.eag_rate_limited',
    i18n: 'errors.EAG_RATE_LIMITED',
    http: 429,
  },
  EAG_SERVICE_UNAVAILABLE: {
    ...management,
    category: 'unavailable',
    retryHint: { kind: 'transient' },
    telemetry: 'external_agent.eag_service_unavailable',
    i18n: 'errors.EAG_SERVICE_UNAVAILABLE',
    http: 503,
  },
  EAG_INVALID_RESPONSE: {
    ...management,
    category: 'internal',
    retryHint: { kind: 'transient' },
    telemetry: 'external_agent.eag_invalid_response',
    i18n: 'errors.EAG_INVALID_RESPONSE',
    http: 502,
  },
  EAG_NETWORK_ERROR: {
    ...management,
    category: 'unavailable',
    retryHint: { kind: 'transient' },
    telemetry: 'external_agent.eag_network_error',
    i18n: 'errors.EAG_NETWORK_ERROR',
    http: 503,
  },
});
export type ExternalAgentFailure = PublicFailureOf<typeof ExternalAgentFailureRegistry>;
export type ExternalAgentFailureCode = ExternalAgentFailure['code'];
export const ExternalAgentFailureSchema = createPublicFailureSchema(ExternalAgentFailureRegistry);
export const externalAgentFailure = (code: ExternalAgentFailureCode): ExternalAgentFailure =>
  createPublicFailure(ExternalAgentFailureRegistry, code, {});
