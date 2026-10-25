export type LoginField = 'email' | 'password';
export type RegisterField = 'email' | 'password' | 'confirmPassword';
export type ForgotField = 'email';
export type ResetField = 'newPassword' | 'confirmPassword';

export type AuthValidationKey =
  | 'auth.validation.emailRequired'
  | 'auth.validation.emailInvalid'
  | 'auth.validation.passwordRequired'
  | 'auth.validation.passwordMinLength'
  | 'auth.validation.passwordMaxLength'
  | 'auth.validation.passwordComplexity'
  | 'auth.validation.confirmPasswordRequired'
  | 'auth.validation.passwordMismatch';

export type ValidationErrors<T extends string> = Partial<Record<T, AuthValidationKey>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailError(value: string): AuthValidationKey | undefined {
  const email = value.trim();
  if (!email) return 'auth.validation.emailRequired';
  if (!EMAIL_PATTERN.test(email)) return 'auth.validation.emailInvalid';
  return undefined;
}

function passwordError(value: string): AuthValidationKey | undefined {
  if (!value) return 'auth.validation.passwordRequired';
  if (value.length < 8) return 'auth.validation.passwordMinLength';
  if (value.length > 100) return 'auth.validation.passwordMaxLength';
  const groups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z\d]/].filter((pattern) => pattern.test(value));
  if (groups.length < 2) return 'auth.validation.passwordComplexity';
  return undefined;
}

export function validateLogin(values: {
  email: string;
  password: string;
}): ValidationErrors<LoginField> {
  const errors: ValidationErrors<LoginField> = {};
  const email = emailError(values.email);
  if (email) errors.email = email;
  if (!values.password) errors.password = 'auth.validation.passwordRequired';
  return errors;
}

export function validateRegistration(values: {
  email: string;
  password: string;
  confirmPassword: string;
}): ValidationErrors<RegisterField> {
  const errors: ValidationErrors<RegisterField> = {};
  const email = emailError(values.email);
  const password = passwordError(values.password);
  if (email) errors.email = email;
  if (password) errors.password = password;
  if (!values.confirmPassword) errors.confirmPassword = 'auth.validation.confirmPasswordRequired';
  else if (values.password !== values.confirmPassword)
    errors.confirmPassword = 'auth.validation.passwordMismatch';
  return errors;
}

export function validateForgotPassword(values: { email: string }): ValidationErrors<ForgotField> {
  const error = emailError(values.email);
  return error ? { email: error } : {};
}

export function validateResetPassword(values: {
  newPassword: string;
  confirmPassword: string;
}): ValidationErrors<ResetField> {
  const errors: ValidationErrors<ResetField> = {};
  const password = passwordError(values.newPassword);
  if (password) errors.newPassword = password;
  if (!values.confirmPassword) errors.confirmPassword = 'auth.validation.confirmPasswordRequired';
  else if (values.newPassword !== values.confirmPassword)
    errors.confirmPassword = 'auth.validation.passwordMismatch';
  return errors;
}

export function firstInvalidField<T extends string>(
  errors: Partial<Record<T, AuthValidationKey>>,
  order: readonly T[],
): T | null {
  return order.find((field) => Boolean(errors[field])) ?? null;
}
