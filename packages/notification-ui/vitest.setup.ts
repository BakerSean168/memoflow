/**
 * Test-only host binding for the extracted Notification UI package.
 *
 * The specs exercise the real renderer binding owned by app-vue, reached through the
 * `@notification-ui-test-host/*` alias. Production sources never import app-vue.
 */
import { installNotificationUiHost } from '@notification-ui-test-host/di/notification-ui-host';

installNotificationUiHost();
