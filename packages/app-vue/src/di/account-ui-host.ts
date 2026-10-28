import { bindAccountUiHost } from '@memoflow/account-ui/host';
import SettingsDangerZone from '../components/shared/settings/SettingsDangerZone.vue';
import SettingsSection from '../components/shared/settings/SettingsSection.vue';
import {
  ACCOUNT_SERVICE_KEY,
  AUTH_SERVICE_KEY,
  DESKTOP_ACCESS_SNAPSHOT_KEY,
  DESKTOP_BRIDGE_KEY,
  EXTERNAL_AGENT_SERVICE_KEY,
  LOGOUT_HANDLER_KEY,
  PROFILE_LOCK_HANDLER_KEY,
} from './keys';
import { installPlatformRendererHost } from './platform-ui-host';

/** Bind the renderer capabilities the Account surfaces rely on before mounting them. */
export function installAccountUiHost(): void {
  bindAccountUiHost({
    ...installPlatformRendererHost(),
    ACCOUNT_SERVICE_KEY,
    AUTH_SERVICE_KEY,
    EXTERNAL_AGENT_SERVICE_KEY,
    DESKTOP_ACCESS_SNAPSHOT_KEY,
    DESKTOP_BRIDGE_KEY,
    LOGOUT_HANDLER_KEY,
    PROFILE_LOCK_HANDLER_KEY,
    components: {
      SettingsDangerZone,
      SettingsSection,
    },
  });
}
