import type { IResultHttpClient } from '@memoflow/http-client';

import { createSettingHttpAdapters } from '../infrastructure-client';
import { createSettingClientService } from './index';

export function createSettingServiceFromHttpClient(httpClient: IResultHttpClient) {
  const adapters = createSettingHttpAdapters(httpClient);
  return createSettingClientService(adapters.setting);
}
