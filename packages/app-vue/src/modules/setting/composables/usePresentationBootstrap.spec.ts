import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import type {
  PreferenceNamespaceResponse,
  UserPreferenceProfile,
} from '@memoflow/contracts/setting';
import { createTestPinia } from '@memoflow/test-utils';
import { SETTING_SERVICE_KEY } from '../../../di/keys';
import { getProductTime } from '../../../shared/utils/product-time';
import { usePresentationPreferenceStore } from '../stores/presentation-preference-store';
import { usePresentationBootstrap } from './usePresentationBootstrap';

const profile: UserPreferenceProfile = {
  presentation: { theme: 'dark', language: 'en-US' },
  regional: {
    timeZone: 'Asia/Tokyo',
    dateStyle: 'long',
    timeStyle: '12h',
    weekStartsOn: 0,
  },
};

function regionalResponse(
  revision = 1,
  timeZone: UserPreferenceProfile['regional']['timeZone'] = profile.regional.timeZone,
): PreferenceNamespaceResponse {
  return {
    namespace: 'regional',
    preferences: { ...profile.regional, timeZone },
    revision,
  };
}

function mountComposable(options?: {
  profileResult?: ReturnType<typeof ok<UserPreferenceProfile>>;
  regionalResults?: PreferenceNamespaceResponse[];
}) {
  let composable!: ReturnType<typeof usePresentationBootstrap>;
  const pinia = createTestPinia();
  const regionalResults = options?.regionalResults ?? [regionalResponse()];
  const getPreferenceNamespace = vi.fn();
  for (const response of regionalResults) {
    getPreferenceNamespace.mockResolvedValueOnce(ok(response));
  }
  if (regionalResults.length === 1) {
    getPreferenceNamespace.mockResolvedValue(ok(regionalResults[0]!));
  }

  const service = {
    getPreferenceProfile: vi.fn().mockResolvedValue(options?.profileResult ?? ok(profile)),
    getPreferenceNamespace,
    patchPreferenceNamespace: vi.fn().mockResolvedValue(
      ok({
        namespace: 'regional',
        revision: 1,
        changedKeys: ['timeZone'],
      }),
    ),
  };

  mount(
    defineComponent({
      setup() {
        composable = usePresentationBootstrap();
        return () => h('div');
      },
    }),
    {
      global: {
        plugins: [pinia],
        provide: { [SETTING_SERVICE_KEY as symbol]: service },
      },
    },
  );

  return { composable, service, pinia };
}

describe('usePresentationBootstrap canonical preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'setTimeout',
      vi.fn(() => 1),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('drives shared theme/locale and Product Time from the canonical profile', async () => {
    const { composable, service, pinia } = mountComposable();
    await composable.loadUserPreferences();

    expect(service.getPreferenceNamespace).toHaveBeenCalledWith('regional');
    expect(service.patchPreferenceNamespace).not.toHaveBeenCalled();
    expect(service.getPreferenceProfile).toHaveBeenCalledTimes(1);
    expect(usePresentationPreferenceStore(pinia).theme).toBe('dark');
    expect(usePresentationPreferenceStore(pinia).locale).toBe('en-US');
    expect(getProductTime().context).toMatchObject({ timeZone: 'Asia/Tokyo', weekStartsOn: 0 });
    expect(getProductTime().presentation).toMatchObject({
      locale: 'en-US',
      dateStyle: 'long',
      timeStyle: '12h',
    });
  });

  it('materializes the first authenticated regional profile from the device IANA timezone', async () => {
    const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const initializedProfile: UserPreferenceProfile = {
      ...profile,
      regional: {
        ...profile.regional,
        timeZone: deviceTimeZone as UserPreferenceProfile['regional']['timeZone'],
      },
    };
    const { composable, service } = mountComposable({
      regionalResults: [regionalResponse(0, 'UTC')],
      profileResult: ok(initializedProfile),
    });

    await composable.loadUserPreferences();

    expect(service.patchPreferenceNamespace).toHaveBeenCalledWith(
      'regional',
      { timeZone: deviceTimeZone },
      0,
    );
    expect(getProductTime().context.timeZone).toBe(deviceTimeZone);
  });

  it('accepts a concurrent first-profile winner instead of overwriting it', async () => {
    const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const winnerProfile: UserPreferenceProfile = {
      ...profile,
      regional: { ...profile.regional, timeZone: 'Asia/Tokyo' },
    };
    const { composable, service } = mountComposable({
      regionalResults: [regionalResponse(0, 'UTC'), regionalResponse(1, 'Asia/Tokyo')],
      profileResult: ok(winnerProfile),
    });
    service.patchPreferenceNamespace.mockResolvedValueOnce(
      fail({ code: 'CONFLICT', message: 'another client initialized first' }),
    );

    await composable.loadUserPreferences();

    expect(service.patchPreferenceNamespace).toHaveBeenCalledWith(
      'regional',
      { timeZone: deviceTimeZone },
      0,
    );
    expect(service.getPreferenceNamespace).toHaveBeenCalledTimes(2);
    expect(getProductTime().context.timeZone).toBe('Asia/Tokyo');
  });

  it('keeps device-local Product Time when canonical bootstrap fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { composable, service } = mountComposable({
      profileResult: fail({ code: 'SERVICE_UNAVAILABLE', message: 'down' }) as never,
    });

    await composable.loadUserPreferences();

    expect(service.getPreferenceNamespace).toHaveBeenCalledTimes(1);
    expect(service.getPreferenceProfile).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
