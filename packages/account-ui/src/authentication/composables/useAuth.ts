/**
 * useAuth - 认证模块主 composable
 *
 * 薄编排层，组合 Better Auth 登录、注册与登出。
 * 所有具体逻辑由子 composable 承载。
 *
 * @module authentication/composables
 */

import { computed } from 'vue';
import { createAuthContext } from './useAuthContext';
import { useLogin } from './useLogin';
import { useRegister } from './useRegister';

export function useAuth() {
  const ctx = createAuthContext();
  const loginOps = useLogin(ctx);
  const registerOps = useRegister(ctx);

  return {
    // State
    isAuthenticated: computed(() => ctx.store.isAuthenticated),
    isLoading: computed(() => ctx.store.isLoading),
    error: computed(() => ctx.store.error),
    currentIdentity: computed(() => ctx.store.currentIdentity),
    resultError: computed(() => ctx.lastResultError.value),
    // Login
    loginByEmail: loginOps.loginByEmail,
    // Register
    registerByEmail: registerOps.registerByEmail,
    signOut: async () => {
      const result = await ctx.service.signOut();
      if (result.ok) {
        ctx.store.reset();
      }
      return result.ok;
    },
  };
}
