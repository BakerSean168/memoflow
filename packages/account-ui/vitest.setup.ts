/**
 * Test-only host binding for the extracted Account UI package.
 *
 * The specs exercise the real renderer binding owned by app-vue, reached through the
 * `@account-ui-test-host/*` alias. Production sources never import app-vue.
 */
import { installAccountUiHost } from '@account-ui-test-host/di/account-ui-host';

installAccountUiHost();
