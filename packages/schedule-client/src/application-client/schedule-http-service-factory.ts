import type { IResultHttpClient } from '@memoflow/http-client';
import { createScheduleEventHttpAdapter } from '../infrastructure-client';
import { createScheduleClientService, type ScheduleClientService } from './schedule-client-service';

export function createScheduleServiceFromHttpClient(
  httpClient: IResultHttpClient,
): ScheduleClientService {
  return createScheduleClientService(createScheduleEventHttpAdapter(httpClient));
}
