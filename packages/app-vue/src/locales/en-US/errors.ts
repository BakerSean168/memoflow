export default {
  EAG_SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Please try again later.',
  EAG_RATE_LIMITED: 'Too many requests. Please try again later.',
  EAG_VALIDATION_ERROR: 'Some submitted data is invalid. Please review and try again.',
  EAG_FORBIDDEN: 'You do not have permission to perform this action.',
  EAG_UNAUTHORIZED: 'Your session is no longer valid. Please sign in again.',
  EAG_CONSENT_INVALID:
    'This authorization request is invalid or expired. Reconnect from your client.',
  EAG_SERVICE_DISABLED: 'External connections are not enabled.',
  EAG_INVALID_RESPONSE: 'The connection service returned an invalid response. Please retry.',
  EAG_NETWORK_ERROR: 'Unable to connect. Check your network and retry.',
  SIGN_IN_FAILED: 'Sign-in did not complete. Please retry.',

  AI_WORKFLOW_STATUS_UNSUPPORTED:
    'This workflow state is no longer supported. Start a new workflow.',
  LOCAL_AGENT_RATE_LIMITED:
    'This Agent channel is rate limiting requests. Try again later or choose another model.',
  LOCAL_AGENT_QUOTA_EXHAUSTED:
    'This Agent channel has insufficient quota. Wait for quota to recover or explicitly choose another channel.',
  AI_RUNTIME_ERROR: 'This reply could not be completed. Try again or switch models.',
  AI_RUNTIME_TRANSPORT_ERROR: 'This reply could not be completed. Try again or switch models.',
  PROVIDER_AUTH_FAILED:
    'The model service denied access. Check the provider API key and permissions.',
  MODEL_NOT_AVAILABLE:
    'This model is unavailable. Switch models or check the provider configuration.',
  AI_CONFIGURATION_REQUIRED: 'Configure an available model service in provider settings first.',
  AI_CAPABILITY_UNSUPPORTED: 'This model does not support this feature. Switch models.',
  AI_CAPABILITY_UNVERIFIED:
    'Support for this feature is unverified. Switch models or check the provider configuration.',
  BAD_REQUEST: 'The request is invalid. Please review and try again.',
  UNAUTHORIZED: 'Your session is no longer valid. Please sign in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested item was not found or has been removed.',
  CONFLICT: 'This request conflicts with existing data. Please try again.',
  VALIDATION_ERROR: 'Some submitted data is invalid. Please review and try again.',
  RATE_LIMITED: 'Request or quota limit reached. Please try again later.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Please try again later.',
  INTERNAL_ERROR: 'The service encountered an error. Please try again later.',
  TIMEOUT: 'The request timed out. Please try again.',
  UNKNOWN: 'The operation failed. Please try again.',
  EMAIL_VERIFICATION_REQUIRED: 'Please verify your email before using this feature',
} as const;
