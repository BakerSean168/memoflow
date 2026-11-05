export { useAccount, useAccountSignOut } from './composables';
export { useAccountStore } from './stores/account-store';
export type { AccountState } from './stores/account-store';
export { accountRoutes } from './router';

// Avatar (Issue #858)
export { useAccountAvatar } from './avatar/useAccountAvatar';
export type { AccountAvatarStore } from './avatar/account-avatar-store';
export {
  AvatarImageError,
  processAvatarFile,
  blobToDataUrl,
  AVATAR_MAX_EDGE,
  type AvatarImageErrorCode,
} from './avatar/avatar-image';

// Components
export * from './components';
