import type { CloudAuthWebClientPort } from '@memoflow/contracts/cloud-auth';
import { inject, type InjectionKey } from 'vue';

export const AUTH_WEB_SERVICE_KEY: InjectionKey<CloudAuthWebClientPort> =
  Symbol('CloudAuthService');

export function useAuthService(): CloudAuthWebClientPort {
  const service = inject(AUTH_WEB_SERVICE_KEY);
  if (!service) throw new Error('[web-auth] Missing CloudAuthService');
  return service;
}
