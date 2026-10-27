import type { IResultHttpClient } from '@memoflow/http-client';

import { createRepositoryHttpAdapters } from '../infrastructure-client';
import {
  RepositoryClientService,
  createRepositoryClientService,
} from './repository-client-service';

export function createRepositoryServiceFromHttpClient(
  httpClient: IResultHttpClient,
): RepositoryClientService {
  const adapters = createRepositoryHttpAdapters(httpClient);
  return createRepositoryClientService(adapters.repository);
}
