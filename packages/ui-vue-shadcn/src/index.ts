/**
 * @memoflow/ui-vue-shadcn
 *
 * Vue 3 UI 组件库（合并 ui-vue）
 *
 * 此包包含：
 * 1. `components/ui/*` - 通过 shadcn-vue CLI 生成的官方组件（不可修改）
 * 2. `components/custom/*` - 自定义业务组件
 * 3. `composables/*` - Vue Composables（封装 ui-core 逻辑）
 *
 * 使用方式：
 *   import { Button, useFormValidation } from '@memoflow/ui-vue-shadcn'
 *
 * 添加新组件：
 *   pnpm dlx shadcn-vue@latest add button
 *   pnpm dlx shadcn-vue@latest add card
 */

// ==========================================
// 1. Core Types & Utilities (from ui-core)
// ==========================================
export type {
  ValidationRule,
  ValidationRules,
  PasswordStrengthLevel,
  PasswordStrengthResult,
  LoadingState,
  LoadingStore,
  MessageType,
  MessageOptions,
  MessageState,
  MessageStore,
  DialogState,
  DialogStore,
  ColorPickerState,
  ColorPickerStore,
  UseColorPickerOptions,
} from '@memoflow/ui-core';

export {
  VALIDATION_RULES,
  generatePassword,
  generatePassphrase,
  isLightColor,
  hexToRgb,
  rgbToHex,
} from '@memoflow/ui-core';

// ==========================================
// 2. Vue Composables
// ==========================================
export { useFormValidation, type UseFormValidationReturn } from './composables/useFormValidation';
export {
  usePasswordStrength,
  type UsePasswordStrengthReturn,
} from './composables/usePasswordStrength';
export { useLoading, type UseLoadingReturn } from './composables/useLoading';
export { useMessage, type UseMessageReturn } from './composables/useMessage';
export { useDialog, type UseDialogReturn } from './composables/useDialog';
export { useColorPicker, type UseColorPickerReturn } from './composables/useColorPicker';
export {
  useConfirm,
  _getConfirmState,
  _resolveConfirm,
  type ConfirmOptions,
  type ConfirmVariant,
} from './composables/useConfirm';
export {
  useSheet,
  closeSheet,
  _getSheetState,
  _closeSheet,
  type SheetOptions,
  type SheetSide,
} from './composables/useSheet';
export {
  openCommandPalette,
  closeCommandPalette,
  toggleCommandPalette,
  registerStaticCommands,
  registerDynamicCommands,
  _getCommandPaletteState,
  _setOpen,
  useCommandGroups,
  type PaletteCommandItem,
  type PaletteCommandGroup,
} from './composables/useCommandPalette';
export {
  progressStart,
  progressDone,
  progressFinish,
  _getProgressBarState,
} from './composables/useProgressBar';

// ==========================================
// 3. Utility Functions
// ==========================================
export * from './lib/utils';

// ==========================================
// Official shadcn-vue components
// ==========================================
// 通过 CLI 生成后，在此处导出
export * from './components/ui/accordion';
export * from './components/ui/alert';
export * from './components/ui/alert-dialog';
export * from './components/ui/aspect-ratio';
export * from './components/ui/avatar';
export * from './components/ui/badge';
export * from './components/ui/breadcrumb';
export * from './components/ui/button';
export * from './components/ui/button-group';
export * from './components/ui/calendar';
export * from './components/ui/card';
// export * from './components/ui/carousel';
export * from './components/ui/checkbox';
export * from './components/ui/collapsible';
export * from './components/ui/command';
export * from './components/ui/context-menu';
export * from './components/ui/dialog';
// export * from './components/ui/drawer';
export * from './components/ui/dropdown-menu';
export * from './components/ui/form';
export * from './components/ui/hover-card';
export * from './components/ui/input';
export * from './components/ui/label';
export * from './components/ui/menubar';
export * from './components/ui/navigation-menu';
export * from './components/ui/number-field';
export * from './components/ui/pagination';
export * from './components/ui/pin-input';
export * from './components/ui/popover';
export * from './components/ui/progress';
export * from './components/ui/radio-group';
export * from './components/ui/resizable';
export * from './components/ui/scroll-area';
export * from './components/ui/select';
export * from './components/ui/separator';
export * from './components/ui/sheet';
export * from './components/ui/skeleton';
export * from './components/ui/slider';
export * from './components/ui/sonner';
export * from './components/ui/switch';
export * from './components/ui/table';
export * from './components/ui/tabs';
export * from './components/ui/tags-input';
export * from './components/ui/textarea';
export * from './components/ui/toggle';
export * from './components/ui/toggle-group';
export * from './components/ui/tooltip';
// Note: toast is not available, use sonner instead
// export * from './components/ui/toast';

// ==========================================
// 4. Custom Components
// ==========================================
export * from './components/custom/form';
// Linear layout components (generic, stays in ui-vue-shadcn)
export * from './components/custom/linear';

// NOTE: All business components (account, authentication, task, schedule,
// reminder, repository, notification, setting, application)
// have been migrated to @memoflow/app-vue.
