import type { IResultHttpClient } from '@memoflow/http-client';

import { createAccountHttpAdapters } from '../infrastructure-client';
import {
  AccountClientService,
  createAccountClientService,
} from './services/account-client-service';

export function createAccountServiceFromHttpClient(
  httpClient: IResultHttpClient,
): AccountClientService {
  const adapters = createAccountHttpAdapters(httpClient);
  return createAccountClientService(adapters.account);
}
