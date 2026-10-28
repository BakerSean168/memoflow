import { createApp } from 'vue';
import { describe, expect, it } from 'vitest';
import { accountUiHost } from '@memoflow/account-ui/host';
import { installAuthServices } from './di-auth';

/**
 * `/auth` is its own renderer composition root and never imports the app-vue
 * entry, so nothing else in that boot path binds the Account UI host.
 * WebAuthView's setup reads `accountUiHost.useStrictInject` through
 * `usePassword`, which used to throw and leave the auth page blank.
 */
describe('auth composition root', () => {
  it('binds the Account UI host before the auth surfaces mount', () => {
    installAuthServices(createApp({}));

    expect(accountUiHost).toBeDefined();
    expect(accountUiHost.useStrictInject).toBeTypeOf('function');
    expect(accountUiHost.AUTH_SERVICE_KEY).toBeDefined();
  });
});
