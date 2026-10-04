import type { CloudAccountSummary } from '@memoflow/contracts';
import type { ResultError } from '@memoflow/contracts/result';
import { computed, ref } from 'vue';
import { startGithubPopupSignIn } from './github-popup-sign-in';
import { useAuthService } from './service';

export type DeviceApprovalState =
  | 'loading'
  | 'sign_in_required'
  | 'ready_to_approve'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'invalid'
  | 'failed';

function normalizeUserCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function useDeviceAuthorization(initialUserCode: string) {
  const service = useAuthService();
  const userCode = ref(normalizeUserCode(initialUserCode));
  const state = ref<DeviceApprovalState>('loading');
  const account = ref<CloudAccountSummary | null>(null);
  const error = ref<ResultError | null>(null);
  const isBusy = computed(() => state.value === 'loading');

  async function load() {
    error.value = null;
    if (!userCode.value) {
      state.value = 'invalid';
      return;
    }
    state.value = 'loading';
    const session = await service.getSession();
    if (!session.ok) {
      error.value = session.error;
      state.value = 'failed';
      return;
    }
    if (!session.data.account || !session.data.session) {
      state.value = 'sign_in_required';
      return;
    }
    account.value = session.data.account;
    const verification = await service.getDeviceAuthorization(userCode.value);
    if (!verification.ok) {
      error.value = verification.error;
      state.value =
        verification.error.code === 'EXPIRED_TOKEN'
          ? 'expired'
          : verification.error.code === 'INVALID_REQUEST'
            ? 'invalid'
            : 'failed';
      return;
    }
    if (verification.data.status === 'approved') {
      state.value = 'approved';
      return;
    }
    if (verification.data.status === 'denied') {
      state.value = 'denied';
      return;
    }
    state.value = 'ready_to_approve';
  }

  async function approve() {
    state.value = 'loading';
    const result = await service.approveDeviceAuthorization(userCode.value);
    if (!result.ok) {
      error.value = result.error;
      state.value = 'failed';
      return;
    }
    state.value = 'approved';
  }

  async function deny() {
    state.value = 'loading';
    const result = await service.denyDeviceAuthorization(userCode.value);
    if (!result.ok) {
      error.value = result.error;
      state.value = 'failed';
      return;
    }
    state.value = 'denied';
  }

  async function startGithubLogin() {
    error.value = null;
    const result = await startGithubPopupSignIn(service);
    if (result.kind === 'failed') {
      error.value = result.error;
      state.value = 'failed';
      return;
    }
    if (result.kind === 'cancelled') {
      state.value = 'sign_in_required';
      return;
    }
    await load();
  }

  return {
    userCode,
    state,
    account,
    error,
    isBusy,
    load,
    approve,
    deny,
    startGithubLogin,
  };
}
