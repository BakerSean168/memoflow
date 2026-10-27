/**
 * Test-only host binding for the extracted Settings UI package.
 *
 * The specs exercise the real renderer binding owned by app-vue, reached through the
 * `@setting-ui-test-host/*` alias. Production sources never import app-vue.
 */
import { installAiUiHost } from '@setting-ui-test-host/di/ai-ui-host';
import { installSettingUiHost } from '@setting-ui-test-host/di/setting-ui-host';

installAiUiHost();
installSettingUiHost();
