import { useAppClientRegistry } from '../providers/app-client-registry-provider';

export function useSchedulerService() {
  return useAppClientRegistry().schedulerService;
}
