import type { IResultHttpClient } from '@memoflow/http-client';

import { createNotificationHttpAdapters } from '../infrastructure-client';
import {
  NotificationClientService,
  createNotificationClientService,
} from './notification-client-service';

export function createNotificationServiceFromHttpClient(
  httpClient: IResultHttpClient,
): NotificationClientService {
  const adapters = createNotificationHttpAdapters(httpClient);
  return createNotificationClientService(adapters.notification);
}
