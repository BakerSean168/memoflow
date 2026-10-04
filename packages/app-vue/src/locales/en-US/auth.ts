export default {
  "page": {
    "redirecting": "Redirecting to sign in…",
    "description": "Sign in to use sync and online capabilities",
    "languageSelector": "Interface language",
    "legalNoticePrefix": "By continuing, you agree to the ",
    "legalNoticeMid": " and ",
    "legalNoticeSuffix": ".",
    "termsOfService": "Terms of Service",
    "privacyPolicy": "Privacy Policy",
    "locales": { "zhCN": "中文", "enUS": "EN" }
  },
  "popup": {
    "completingTitle": "Completing GitHub sign-in",
    "completingDescription": "This window will close automatically when authorization finishes.",
    "completeTitle": "GitHub sign-in complete",
    "completeDescription": "You can safely close this window and return to MemoFlow.",
    "failedTitle": "Unable to complete GitHub sign-in",
    "failedDescription": "Close this window, return to MemoFlow, and try again."
  },
  "login": {
    "heading": "Sign in to {app}",
    "submitting": "Signing in...",
    "submit": "Sign in",
    "registerLink": "Sign up",
    "forgotLink": "Forgot password?",
    "github": "GitHub"
  },
  "register": {
    "heading": "Create your {app} account",
    "description": "Create a cloud account to enable sync",
    "submitting": "Signing up...",
    "submit": "Sign up"
  },
  "forgot": {
    "heading": "Reset your password",
    "description": "Enter your email and we will send a password reset link",
    "submitting": "Sending...",
    "submit": "Send reset link",
    "sent": "If an account exists for that email, a reset link will arrive shortly."
  },
  "reset": {
    "heading": "Choose a new password",
    "description": "Choose a new password for your cloud account",
    "submit": "Reset password",
    "success": "Password updated. Sign in with your new password."
  },
  "verify": {
    "heading": "Verify your email",
    "description": "We sent a verification link to {email}",
    "backToLogin": "Back to sign in",
    "linkInstruction": "Open the verification link in your email. You can close this page afterward."
  },
  "profileAccess": {
    "title": "Open a local Profile",
    "description": "Choose the local profile and data you want to continue using.",
    "guest": "Guest Profile",
    "registered": "Cloud connected",
    "open": "Open",
    "unlock": "Unlock",
    "pinPlaceholder": "Enter local PIN",
    "pinRequired": "Enter your local PIN",
    "remove": "Delete local Profile",
    "removeConfirm": "Delete {name} and its local data?",
    "removed": "Local Profile deleted"
  },
  "field": {
    "name": "Name",
    "email": "Email",
    "password": "Password",
    "confirmPassword": "Confirm password",
    "newPassword": "New password"
  },
  "validation": {
    "emailRequired": "Enter your email address",
    "emailInvalid": "Enter a valid email address",
    "passwordRequired": "Enter your password",
    "passwordMinLength": "Password must be at least 8 characters",
    "passwordMaxLength": "Password must not exceed 100 characters",
    "passwordComplexity": "Use at least two of uppercase letters, lowercase letters, numbers, or special characters",
    "confirmPasswordRequired": "Enter your password again",
    "passwordMismatch": "Passwords do not match"
  },
  "errors": {
    "BAD_REQUEST": "The authentication request is invalid.",
    "CONFLICT": "The account already exists or this operation conflicts with existing data.",
    "FORBIDDEN": "This account cannot perform the requested action.",
    "NOT_FOUND": "The authentication resource was not found.",
    "UNAUTHORIZED": "Incorrect credentials or the cloud session is no longer valid.",
    "VALIDATION_ERROR": "Some submitted fields are invalid.",
    "RATE_LIMITED": "Too many attempts. Try again later.",
    "NETWORK_ERROR": "The authentication server is unreachable. Your local Profile remains available.",
    "SERVICE_UNAVAILABLE": "Authentication is temporarily unavailable.",
    "INTERNAL_ERROR": "The authentication service encountered an error.",
    "TIMEOUT": "The authentication request timed out.",
    "UNKNOWN": "Authentication failed. Try again later.",
    "EMAIL_VERIFICATION_REQUIRED": "Open the verification email to verify your address.",
    "USER_ALREADY_EXISTS": "This email is already registered. Sign in instead."
  },
  "toast": {
    "loginFailed": "Login failed",
    "registerFailed": "Registration failed",
    "loggedOut": "Cloud account disconnected",
    "loadSessionsFailed": "Failed to load cloud sessions",
    "loadFailed": "Load failed",
    "operationFailed": "Operation failed",
    "pleaseLogin": "Connect a cloud account first",
    "passwordChanged": "Password changed",
    "reloginWithNew": "Reauthenticate with your new password",
    "changePasswordFailed": "Failed to change password",
    "resetEmailSent": "Password reset link sent",
    "checkResetEmail": "Open the reset link in your email",
    "sendResetEmailFailed": "Failed to send reset email",
    "passwordReset": "Password reset",
    "loginWithNew": "Sign in with your new password",
    "resetPasswordFailed": "Failed to reset password"
  },
  "receipt": {
    "requestId": "Request ID",
    "retry": "Try again",
    "dismiss": "Dismiss"
  }
} as const;
