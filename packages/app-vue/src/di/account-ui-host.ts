import { bindAccountUiHost } from '@memoflow/account-ui/host';
import SettingsDangerZone from '../components/shared/settings/SettingsDangerZone.vue';
import SettingsSection from '../components/shared/settings/SettingsSection.vue';
import { createComposableHandleError } from '../shared/utils/create-composable-handle-error';
import { formatProductDateTime } from '../shared/utils/product-time';
import { translateResultError } from '../shared/utils/translate-result-error';
import { useStrictInject } from '../shared/utils/useStrictInject';
import {
  ACCOUNT_SERVICE_KEY,
  AUTH_SERVICE_KEY,
  DESKTOP_ACCESS_SNAPSHOT_KEY,
  DESKTOP_BRIDGE_KEY,
  EXTERNAL_AGENT_SERVICE_KEY,
  LOGOUT_HANDLER_KEY,
  PROFILE_LOCK_HANDLER_KEY,
} from './keys';

/** Bind the renderer capabilities the Account surfaces rely on before mounting them. */
export function installAccountUiHost(): void {
  bindAccountUiHost({
    ACCOUNT_SERVICE_KEY,
    AUTH_SERVICE_KEY,
    EXTERNAL_AGENT_SERVICE_KEY,
    DESKTOP_ACCESS_SNAPSHOT_KEY,
    DESKTOP_BRIDGE_KEY,
    LOGOUT_HANDLER_KEY,
    PROFILE_LOCK_HANDLER_KEY,
    useStrictInject,
    translateResultError,
    createComposableHandleError,
    formatProductDateTime,
    components: {
      SettingsDangerZone,
      SettingsSection,
    },
  });
}
