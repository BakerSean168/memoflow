import type { IResultHttpClient } from '@memoflow/http-client';

import type { ISettingApiClient } from './ports/setting-api-client.port';
import { createSettingHttpAdapters } from '../infrastructure-client/adapters/http';

/**
 * Canonical Setting HTTP client factory.
 *
 * The extracted seam returns the transport port directly: `SettingHttpAdapter`
 * already implements `ISettingApiClient`, so no forwarding service instance is
 * needed (the old `SettingClientService` was a pure pass-through).
 */
export function createSettingServiceFromHttpClient(
  httpClient: IResultHttpClient,
): ISettingApiClient {
  const adapters = createSettingHttpAdapters(httpClient);
  return adapters.setting;
}
