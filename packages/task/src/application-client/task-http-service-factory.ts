import type { IResultHttpClient } from '@memoflow/http-client';

import { createTaskHttpAdapters } from '../infrastructure-client';
import { TaskClientService, createTaskClientService } from './task-client-service';

export function createTaskServiceFromHttpClient(httpClient: IResultHttpClient): TaskClientService {
  const adapters = createTaskHttpAdapters(httpClient);
  return createTaskClientService(adapters.plan, adapters.occurrence);
}
