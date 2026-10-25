import { describe, expect, it } from 'vitest';
import {
  firstInvalidField,
  validateForgotPassword,
  validateLogin,
  validateRegistration,
  validateResetPassword,
} from './validation';

describe('web auth validation', () => {
  it('validates login fields without depending on a cloud-auth implementation schema', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'auth.validation.emailRequired',
      password: 'auth.validation.passwordRequired',
    });
    expect(validateLogin({ email: 'person@example.com', password: 'secret' })).toEqual({});
  });

  it('validates registration and reset password strength and confirmation', () => {
    expect(
      validateRegistration({ email: 'bad', password: 'short', confirmPassword: 'other' }),
    ).toEqual({
      email: 'auth.validation.emailInvalid',
      password: 'auth.validation.passwordMinLength',
      confirmPassword: 'auth.validation.passwordMismatch',
    });
    expect(
      validateResetPassword({ newPassword: 'StrongPass123!', confirmPassword: 'StrongPass123!' }),
    ).toEqual({});
  });

  it('keeps forgot-password validation and focus order deterministic', () => {
    const errors = validateForgotPassword({ email: 'invalid' });
    expect(firstInvalidField(errors, ['email'])).toBe('email');
  });
});
