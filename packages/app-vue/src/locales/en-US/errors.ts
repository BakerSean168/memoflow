export default {
  AI_WORKFLOW_STATUS_UNSUPPORTED:
    'This workflow state is no longer supported. Start a new workflow.',
  BAD_REQUEST: 'The request is invalid. Please review and try again.',
  UNAUTHORIZED: 'Your session is no longer valid. Please sign in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested item was not found or has been removed.',
  CONFLICT: 'This request conflicts with existing data. Please try again.',
  VALIDATION_ERROR: 'Some submitted data is invalid. Please review and try again.',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Please try again later.',
  INTERNAL_ERROR: 'The service encountered an error. Please try again later.',
  TIMEOUT: 'The request timed out. Please try again.',
  UNKNOWN: 'The operation failed. Please try again.',
  EMAIL_VERIFICATION_REQUIRED: 'Please verify your email before using this feature',
} as const;
