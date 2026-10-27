import { repositoryUiHost, type KnowledgeNativeSurfaceHost } from '../repository-ui-host';

export function useKnowledgeNativeSurfaceRegistration(): KnowledgeNativeSurfaceHost | null {
  return repositoryUiHost.useKnowledgeNativeSurfaceRegistration();
}
