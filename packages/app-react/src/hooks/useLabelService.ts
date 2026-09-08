import { useAppClientRegistry } from '../providers/app-client-registry-provider';

export function useLabelService() {
  return useAppClientRegistry().labelService;
}
