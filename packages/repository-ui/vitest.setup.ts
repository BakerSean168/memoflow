/**
 * Test-only host binding for the extracted Repository UI package.
 *
 * The specs exercise the real renderer binding owned by app-vue, reached through the
 * `@repository-ui-test-host/*` alias. Production sources never import app-vue.
 */
import { installRepositoryUiHost } from '@repository-ui-test-host/di/repository-ui-host';

installRepositoryUiHost();
