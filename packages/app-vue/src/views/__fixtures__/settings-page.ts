import { onUnmounted, provide, ref } from 'vue';
import { Toaster } from 'vue-sonner';
import { _getConfirmState, _resolveConfirm } from '@memoflow/ui-vue-shadcn';
import GlobalConfirmDialog from '../../shared/components/GlobalConfirmDialog.vue';
import { ok } from '@memoflow/transport-contracts/result';
import { ProfileAccessChannels } from '@memoflow/desktop-contracts';
import { CLOUD_ACCOUNT_SECURITY_KEY } from '@memoflow/account-ui/host';
import { accountUiHost } from '@memoflow/account-ui/host';
import { useAuthenticationStore } from '@memoflow/account-ui';
import { provideSettingsCapabilities } from './settings-capabilities';
import { settingUiHost } from '@memoflow/setting-ui/host';
import { UserSettingsView } from '@memoflow/setting-ui';

const now = Date.now();

const account = {
  id: 'account-demo',
  status: 'Active',
  profile: {
    nickname: 'Demo Builder',
    realName: null,
    avatarUrl: null,
    bio: 'Building a calmer workspace.',
    gender: 'Unspecified',
    birthday: null,
  },
  version: 1,
  createdAt: now - 86_400_000,
  updatedAt: now,
  closedAt: null,
};

const identity = {
  id: 'identity-demo',
  email: 'demo@example.com',
  name: 'Demo Builder',
  emailVerified: true,
};

const pat = {
  id: 'pat-demo',
  name: 'Daily notes agent',
  prefix: 'mfp_Demo123',
  audience: 'https://api.example.invalid/mcp',
  scopes: ['goals:read', 'tasks:read'],
  createdAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  revokedAt: null,
  lastUsedAt: null,
};

export const connection = {
  id: 'connection-demo',
  name: 'Claude Desktop',
  clientId: 'client-demo',
  scopes: ['goals:read', 'notifications:read'],
  createdAt: '2026-09-01T00:00:00.000Z',
  lastUsedAt: '2026-11-20T00:00:00.000Z',
  expiresAt: '2027-09-01T00:00:00.000Z',
  revokedAt: null,
};

const authService = {
  changePassword: async () => ok(undefined),
  forgotPassword: async () => ok(undefined),
  resetPassword: async () => ok(undefined),
};

const accountService = {
  getMyProfile: async () => ok({ account, cloudIdentity: identity }),
  updateMyProfile: async () => ok({ account, cloudIdentity: identity }),
  closeAccount: async () => ok({ account, cloudIdentity: identity }),
};

export function externalAgents(
  options: { oauth?: boolean; pats?: unknown[]; connections?: unknown[] } = {},
) {
  let tokens = (options.pats ?? [pat]) as (typeof pat)[];
  let clients = (options.connections ?? []) as (typeof connection)[];
  return {
    capabilities: async () => ok({ oauth: options.oauth ?? false }),
    listPats: async () => ok([...tokens]),
    listConnections: async () => ok([...clients]),
    createPat: async () => {
      const created = { ...pat, id: 'pat-created', name: 'New token' };
      tokens.push(created);
      return ok({ ...created, secret: 'mfp_demo_not_a_real_secret' });
    },
    revokePat: async (id: string) => {
      tokens = tokens.filter((row) => row.id !== id);
      return ok(undefined);
    },
    revokeConnection: async (id: string) => {
      clients = clients.filter((row) => row.id !== id);
      return ok(undefined);
    },
    consentRequest: async () => ok(undefined),
    decideConsent: async () => ok(undefined),
  };
}

export type SettingsPageOptions = {
  initialTab?: string;
  theme?: 'light' | 'dark';
  auth?: boolean;
  local?: boolean;
  narrow?: boolean;
  external?: ReturnType<typeof externalAgents> | false;
};

export function renderSettingsPage(options: SettingsPageOptions = {}) {
  return {
    components: { UserSettingsView, GlobalConfirmDialog, Toaster },
    setup() {
      onUnmounted(() => {
        if (_getConfirmState().open) _resolveConfirm(false);
      });
      provide(accountUiHost.LOGOUT_HANDLER_KEY as symbol, async () => undefined);
      const demoAccount = structuredClone(account);
      const preferences = {
        presentation: {
          namespace: 'presentation',
          preferences: { theme: options.theme ?? 'dark', language: 'zh-CN', accent: 'brand-gold' },
          revision: 1,
        },
        regional: {
          namespace: 'regional',
          preferences: {
            timeZone: 'Asia/Shanghai',
            dateStyle: 'medium',
            timeStyle: '24h',
            weekStartsOn: 1,
          },
          revision: 1,
        },
      };
      provide(
        settingUiHost.SETTING_SERVICE_KEY as symbol,
        {
          exportSettings: async () =>
            ok({ fileName: 'memoflow-preferences.json', data: JSON.stringify(preferences) }),
          importSettings: async () => ok({ applied: ['presentation', 'regional'], skipped: [] }),
          resetUserPreferences: async () =>
            ok({
              presentation: { revision: ++preferences.presentation.revision, changedKeys: [] },
              regional: { revision: ++preferences.regional.revision, changedKeys: [] },
            }),
          getPreferenceNamespace: async (namespace: keyof typeof preferences) =>
            ok(preferences[namespace]),
          patchPreferenceNamespace: async (namespace: keyof typeof preferences, patch: object) => {
            const current = preferences[namespace];
            Object.assign(current.preferences, patch);
            return ok({ namespace, revision: ++current.revision, changedKeys: Object.keys(patch) });
          },
          resetPreferenceNamespace: async (namespace: keyof typeof preferences) =>
            ok({ namespace, revision: ++preferences[namespace].revision, changedKeys: [] }),
        } as never,
      );
      provideSettingsCapabilities();
      const authStore = useAuthenticationStore();
      authStore.reset();
      if (!options.local)
        authStore.hydrateCloudSession({
          account: identity,
          session: { id: 'session-demo', expiresAt: '2030-01-01T00:00:00.000Z' },
        });
      provide(
        accountUiHost.ACCOUNT_SERVICE_KEY as symbol,
        {
          ...accountService,
          getMyProfile: async () =>
            ok({ account: demoAccount, cloudIdentity: options.local ? null : identity }),
          updateMyProfile: async (patch: Partial<typeof account.profile>) => {
            Object.assign(demoAccount.profile, patch);
            return ok({ account: demoAccount, cloudIdentity: options.local ? null : identity });
          },
        } as never,
      );
      if (options.local) {
        provide(
          accountUiHost.DESKTOP_ACCESS_SNAPSHOT_KEY as symbol,
          ref({
            profile: { profileId: 'local-demo', profileKind: 'local', displayName: 'Demo Builder' },
          }) as never,
        );
        let profileId: string | null = 'local-demo';
        provide(
          accountUiHost.DESKTOP_BRIDGE_KEY as symbol,
          {
            invoke: async (channel: string, payload?: { profileId: string | null }) => {
              if (channel === ProfileAccessChannels.PASSWORD_SET) return ok(undefined);
              if (channel === ProfileAccessChannels.AUTO_ENTER_SET)
                profileId = payload?.profileId ?? null;
              return ok({
                profileId,
                suppressed: false,
                candidates: [
                  { profileId: 'local-demo', profileKind: 'local', displayName: 'Demo Builder' },
                ],
              });
            },
          } as never,
        );
      } else {
        let sessions = [
          {
            id: 'current',
            current: true,
            userAgent: 'MemoFlow Desktop/0.23 (Linux)',
            ipAddress: '127.0.0.1',
            createdAt: '2026-11-20T09:00:00.000Z',
          },
          {
            id: 'browser',
            current: false,
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
            ipAddress: '127.0.0.1',
            createdAt: '2026-11-19T09:00:00.000Z',
          },
        ];
        provide(CLOUD_ACCOUNT_SECURITY_KEY, {
          listAccountSessions: async () => ok([...sessions]),
          verifyAccountPassword: async () => ok(undefined),
          requestEmailChange: async () => ok(undefined),
          revokeAccountSession: async (id: string) => {
            sessions = sessions.filter((session) => session.id !== id);
            return ok(undefined);
          },
          deleteAccountPermanently: async () => ok(undefined),
        } as never);
      }
      if (options.auth !== false) {
        provide(accountUiHost.AUTH_SERVICE_KEY as symbol, authService as never);
        provide(settingUiHost.AUTH_SERVICE_KEY as symbol, authService as never);
      }
      if (options.external !== false) {
        const service = options.external ?? externalAgents();
        provide(accountUiHost.EXTERNAL_AGENT_SERVICE_KEY as symbol, service as never);
        provide(settingUiHost.EXTERNAL_AGENT_SERVICE_KEY as symbol, service as never);
      }
      return { initialTab: options.initialTab ?? 'account' };
    },
    template: options.narrow
      ? '<div class="h-screen max-w-sm bg-background text-foreground"><UserSettingsView :initial-tab="initialTab" /><GlobalConfirmDialog /><Toaster /></div>'
      : '<div class="h-screen bg-background text-foreground"><UserSettingsView :initial-tab="initialTab" /><GlobalConfirmDialog /><Toaster /></div>',
  };
}
