import type { IResultHttpClient } from '@memoflow/http-client';
import { createSchedulerHttpAdapter } from '../infrastructure-client';
import { createSchedulerClientService, type SchedulerClientService } from './scheduler-client-service';

export function createSchedulerServiceFromHttpClient(
  httpClient: IResultHttpClient,
): SchedulerClientService {
  return createSchedulerClientService(createSchedulerHttpAdapter(httpClient));
}
