/**
 * Setting HTTP Adapters - Registration
 */

import type { IResultHttpClient } from '../types';
import { SettingHttpAdapter } from './setting-http.adapter';

export { SettingHttpAdapter } from './setting-http.adapter';

export interface SettingHttpAdapters {
  setting: SettingHttpAdapter;
}

export function createSettingHttpAdapters(httpClient: IResultHttpClient): SettingHttpAdapters {
  return { setting: new SettingHttpAdapter(httpClient) };
}
