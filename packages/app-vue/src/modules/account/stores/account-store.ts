/**
 * Account Store - Pinia 状态管理
 *
 * 管理 Account 模块的所有状态
 * - Vue 3 + Pinia（Web 应用专用）
 * - Store 在 Composables 中被调用
 * - Composables 处理 Store 更新和 UI 状态
 *
 * @module account/presentation/stores
 */

import { defineStore } from 'pinia';
import type { AccountClientDTO } from '@memoflow/contracts/account';
import { AccountStatus } from '@memoflow/contracts/account';

// ============ State Interface ============
export interface AccountState {
  // 当前账户
  currentAccount: AccountClientDTO | null;
  isInitialized: boolean;

  // UI 状态
  isLoading: boolean;
  error: string | null;
}

// ============ Store ============
export const useAccountStore = defineStore('account', {
  state: (): AccountState => ({
    currentAccount: null,
    isInitialized: false,
    isLoading: false,
    error: null,
  }),

  getters: {
    // ========== 账户状态 ==========
    getCurrentAccountId: (state) => state.currentAccount?.id ?? null,

    getAccountStatus: (state) => state.currentAccount?.status ?? null,

    isActiveAccount: (state) => state.currentAccount?.status === AccountStatus.Active,

    // ========== 资料 ==========
    getNickname: (state) => state.currentAccount?.profile?.nickname ?? null,

    getAvatarUrl: (state) => state.currentAccount?.profile?.avatarUrl ?? null,
  },

  actions: {
    // ========== Account Actions ==========
    setCurrentAccount(account: AccountClientDTO | null) {
      this.currentAccount = account;
    },

    clearCurrentAccount() {
      this.currentAccount = null;
    },

    setInitialized(initialized: boolean) {
      this.isInitialized = initialized;
    },

    // ========== Status Actions ==========
    setLoading(loading: boolean) {
      this.isLoading = loading;
    },

    setError(error: string | null) {
      this.error = error;
    },

    // ========== Lifecycle ==========
    reset() {
      this.currentAccount = null;
      this.isInitialized = false;
      this.isLoading = false;
      this.error = null;
    },
  },
});
