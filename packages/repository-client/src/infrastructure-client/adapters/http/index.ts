/**
 * Repository HTTP Adapters - Registration
 */

import type { IResultHttpClient } from '@memoflow/http-client';
import { RepositoryHttpAdapter } from './repository-http.adapter';

export { RepositoryHttpAdapter } from './repository-http.adapter';

export interface RepositoryHttpAdapters {
  repository: RepositoryHttpAdapter;
}

export function createRepositoryHttpAdapters(
  httpClient: IResultHttpClient,
): RepositoryHttpAdapters {
  return { repository: new RepositoryHttpAdapter(httpClient) };
}
