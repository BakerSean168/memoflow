/**
 * @memoflow/ui-core
 *
 * Framework-agnostic headless UI logic.
 * This package contains pure TypeScript logic with zero framework dependencies.
 * It can be used by Vue, React, or any other framework through adapter packages.
 */

// Form validation
export {
  createFormValidation,
  VALIDATION_RULES,
  type ValidationRule,
  type ValidationRules,
} from './form/validation';

// Password strength
export {
  createPasswordStrength,
  generatePassword,
  generatePassphrase,
  type PasswordStrengthLevel,
  type PasswordStrengthResult,
} from './form/password';

// Loading state
export { createLoadingStore, type LoadingState, type LoadingStore } from './loading/create-loading';

// Message/Snackbar
export {
  createMessageStore,
  type MessageType,
  type MessageOptions,
  type MessageState,
  type MessageStore,
} from './message/create-message';

// Dialog
export { createDialogStore, type DialogState, type DialogStore } from './dialog/create-dialog';

// Color picker
export {
  createColorPickerCore,
  isLightColor,
  hexToRgb,
  rgbToHex,
  type ColorPickerState,
  type ColorPickerStore,
  type UseColorPickerOptions,
} from './color-picker/create-color-picker';
