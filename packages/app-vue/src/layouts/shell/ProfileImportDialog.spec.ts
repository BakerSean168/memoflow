import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { expect, it, vi } from 'vitest';
import {
  DesktopProfileImportChannels as Channels,
  type DesktopProfileImportView,
  type ProfileSummary,
} from '@memoflow/contracts/electron';
import { DESKTOP_BRIDGE_KEY } from '../../di/keys';
import shell from '../../locales/en-US/shell';
import ProfileImportDialog from './ProfileImportDialog.vue';

const PassThrough = defineComponent({
  setup(_, { slots }) {
    return () => h('div', [slots.default?.(), slots.footer?.()]);
  },
});
const source: ProfileSummary = {
  profileId: 'p_111111111111111111111111',
  profileKind: 'guest',
  displayName: 'Local notes',
  avatarSeed: 'a',
  identifierHint: null,
  cloudAccountId: null,
  lastActiveAt: 0,
  hasPin: false,
};
const target: ProfileSummary = {
  ...source,
  profileId: 'p_222222222222222222222222',
  profileKind: 'registered',
  displayName: 'Cloud',
  cloudAccountId: 'owner',
};

function fixture(blocked = false, profiles = [source, target], targetChanges = false) {
  let current: DesktopProfileImportView | null = null;
  const invoke = vi.fn(async (channel: string, input: Record<string, unknown>) => {
    if (channel === Channels.LIST) return { ok: true, data: current ? [current] : [] };
    if (channel === Channels.PREPARE) {
      current = {
        requestId: String(input.requestId),
        targetProfileId: target.profileId,
        sourceProfileId: source.profileId,
        phase: 'preflight',
        plan: {
          schemaVersion: 1,
          operationId: 'operation',
          requestId: String(input.requestId),
          batchId: 'batch',
          sourceDigest: 'a'.repeat(64),
          effectiveDigest: 'b'.repeat(64),
          blockers: [],
          preview: {
            batchId: 'batch',
            dryRun: true,
            capabilities: [
              { key: 'labels', schemaVersion: 3, created: 1, updated: 0, skipped: 0, warnings: [] },
            ],
            created: { labels: 1 },
            updated: {},
            skipped: {},
            warnings: [],
          },
        },
        blockers: blocked
          ? [{ capability: 'local-source', reason: 'unsupported_user_data', field: 'attachments' }]
          : [],
        deleteSource: false,
        serverVerified: false,
        localVerified: false,
        sourceUnchanged: null,
      };
    } else if (current && channel === Channels.COMMIT && targetChanges) {
      current = { ...current, phase: 'prepared', plan: null, deleteSource: false };
      return { ok: false, error: { code: 'TARGET_CHANGED', message: 'Changed' } };
    } else if (current) {
      current = { ...current, phase: 'committed', serverVerified: true, localVerified: false };
    }
    return { ok: true, data: current };
  });
  const wrapper = mount(ProfileImportDialog, {
    props: { open: true, target, profiles },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': { shell } } })],
      provide: { [DESKTOP_BRIDGE_KEY as symbol]: { invoke } },
      stubs: { Dialog: PassThrough, ProductDialogShell: PassThrough },
    },
  });
  const click = async (label: string) => {
    const button = wrapper.findAll('button').find((item) => item.text() === label);
    expect(button).toBeDefined();
    await button!.trigger('click');
    await flushPromises();
  };
  return { wrapper, invoke, click };
}

it('keeps source deletion off by default and recovers the same request while local verification is pending', async () => {
  const { wrapper, invoke, click } = fixture();
  await flushPromises();
  await click('Preview import');
  expect(
    (wrapper.get('[data-testid="profile-import-delete-source"]').element as HTMLInputElement)
      .checked,
  ).toBe(false);
  await click('Confirm copy');
  const commit = invoke.mock.calls.find(([channel]) => channel === Channels.COMMIT)!;
  expect(commit[1]).toMatchObject({ deleteSource: false, targetProfileId: target.profileId });
  expect(wrapper.text()).toContain('local verification pending');
  await click('Recover and verify again');
  expect(invoke.mock.calls.find(([channel]) => channel === Channels.RECOVER)?.[1]).toMatchObject({
    requestId: commit[1].requestId,
  });
  expect(invoke.mock.calls.filter(([channel]) => channel === Channels.PREPARE)).toHaveLength(1);
  wrapper.unmount();
});

it('explains incomplete coverage and disables source deletion', async () => {
  const { wrapper, click } = fixture(true);
  await flushPromises();
  await click('Preview import');
  expect(
    (wrapper.get('[data-testid="profile-import-delete-source"]').element as HTMLInputElement)
      .disabled,
  ).toBe(true);
  expect(wrapper.get('[data-testid="profile-import-blockers"]').text()).toContain(
    'source Profile will be kept',
  );
  wrapper.unmount();
});

it('requires an explicit source choice when more than one guest is available', async () => {
  const second = {
    ...source,
    profileId: 'p_333333333333333333333333',
    displayName: 'Second guest',
  };
  const { wrapper, invoke, click } = fixture(false, [source, second, target]);
  await flushPromises();
  expect(
    (wrapper.get('[data-testid="profile-import-source"]').element as HTMLSelectElement).value,
  ).toBe('');
  const preview = wrapper.findAll('button').find((button) => button.text() === 'Preview import')!;
  expect(preview.attributes('disabled')).toBeDefined();
  await wrapper.get('[data-testid="profile-import-source"]').setValue(second.profileId);
  await click('Preview import');
  expect(invoke.mock.calls.find(([channel]) => channel === Channels.PREPARE)?.[1]).toMatchObject({
    sourceProfileId: second.profileId,
  });
  wrapper.unmount();
});

it('shows the durable recovery state immediately when target changes invalidate the preview', async () => {
  const { wrapper, click } = fixture(false, [source, target], true);
  await flushPromises();
  await click('Preview import');
  await wrapper.get('[data-testid="profile-import-delete-source"]').setValue(true);
  await click('Confirm copy');
  expect(wrapper.text()).toContain('Snapshot saved; preflight pending');
  expect(wrapper.text()).toContain('Run preflight again');
  expect(wrapper.find('[data-testid="profile-import-delete-source"]').exists()).toBe(false);
  expect(
    wrapper.findAll('button').some((button) => button.text() === 'Recover and verify again'),
  ).toBe(true);
  wrapper.unmount();
});
