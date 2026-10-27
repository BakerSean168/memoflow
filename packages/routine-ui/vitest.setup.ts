/**
 * Test-only host binding for the extracted Routine UI package.
 *
 * The specs exercise the real renderer binding owned by app-vue, reached through the
 * `@routine-ui-test-host/*` alias. Production sources never import app-vue.
 */
import { installRoutineUiHost } from '@routine-ui-test-host/di/routine-ui-host';

installRoutineUiHost();
