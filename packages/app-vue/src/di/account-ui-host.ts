import { bindAccountUiHost } from '@memoflow/account-ui/host';
import SettingsDangerZone from '../components/shared/settings/SettingsDangerZone.vue';
import SettingsSection from '../components/shared/settings/SettingsSection.vue';
import ProductDialogShell from '../shared/components/ProductDialogShell.vue';
import ProductAutoTextarea from '../shared/components/ProductAutoTextarea.vue';
import ProductInlineValidation from '../shared/components/ProductInlineValidation.vue';
import { useTransientFeedback } from '../shared/composables/useTransientFeedback';
import {
  ACCOUNT_AVATAR_STORE_KEY,
  ACCOUNT_SERVICE_KEY,
  AUTH_SERVICE_KEY,
  DESKTOP_ACCESS_SNAPSHOT_KEY,
  DESKTOP_BRIDGE_KEY,
  EXTERNAL_AGENT_SERVICE_KEY,
  LOGOUT_HANDLER_KEY,
  PROFILE_EDITOR_INTENT_KEY,
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
    ACCOUNT_AVATAR_STORE_KEY,
    PROFILE_EDITOR_INTENT_KEY,
    LOGOUT_HANDLER_KEY,
    useTransientFeedback,
    components: {
      ProductDialogShell,
      ProductAutoTextarea,
      ProductInlineValidation,
      SettingsDangerZone,
      SettingsSection,
    },
  });
}
