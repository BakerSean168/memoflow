/** @vitest-environment happy-dom */

import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { LABEL_SERVICE_KEY } from '../../di/keys';
import {
  createTestServerStateRuntime,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
} from '../../platform/server-state';
import { labelCatalogQueryKeys, useLabelCatalog } from './useLabelCatalog';

const label = {
  id: 'label-work',
  name: 'Work',
  color: '#3366ff',
  normalizedName: 'work',
  createdAt: 1,
  updatedAt: 1,
};

describe('useLabelCatalog', () => {
  it('looks up proposed names without writes and resolves missing names only on explicit submit', async () => {
    const listLabels = vi.fn().mockResolvedValue(ok([label]));
    const createLabel = vi.fn().mockResolvedValue(ok({ ...label, id: 'label-new', name: 'New' }));
    const runtime = createTestServerStateRuntime();
    let api!: ReturnType<typeof useLabelCatalog>;
    const Host = defineComponent({
      setup() {
        api = useLabelCatalog();
        return () => h('div');
      },
    });
    const wrapper = mount(Host, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient: runtime.queryClient }]],
        provide: {
          [LABEL_SERVICE_KEY as symbol]: { listLabels, createLabel },
          [SERVER_STATE_RUNTIME_KEY]: runtime,
          [SERVER_STATE_IDENTITY_SCOPE_KEY]: () => 'identity-1',
        },
      },
    });
    await flushPromises();
    expect(await api.existingNames([' WORK ', 'New'])).toEqual([
      { name: ' WORK ', label },
      { name: 'New', label: null },
    ]);
    expect(createLabel).not.toHaveBeenCalled();
    expect(await api.resolveNames(['WORK', 'New'])).toEqual(['label-work', 'label-new']);
    expect(createLabel).toHaveBeenCalledWith({ name: 'New' });
    expect(
      runtime.queryClient.getQueryData(labelCatalogQueryKeys.identity('identity-2')),
    ).toBeUndefined();
    wrapper.unmount();
  });
  it('keeps identity in the query scope while list/create requests remain current-user only', async () => {
    const listLabels = vi.fn().mockResolvedValue(ok([]));
    const createLabel = vi.fn().mockResolvedValue(ok(label));
    const runtime = createTestServerStateRuntime();
    let api!: ReturnType<typeof useLabelCatalog>;
    const Host = defineComponent({
      setup() {
        api = useLabelCatalog();
        return () => h('div');
      },
    });

    const wrapper = mount(Host, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient: runtime.queryClient }]],
        provide: {
          [LABEL_SERVICE_KEY as symbol]: { listLabels, createLabel },
          [SERVER_STATE_RUNTIME_KEY]: runtime,
          [SERVER_STATE_IDENTITY_SCOPE_KEY]: () => 'identity-1',
        },
      },
    });
    await flushPromises();

    expect(listLabels).toHaveBeenCalledWith({ limit: 500 });
    const created = await api.createLabel('Work');
    expect(created).toEqual(label);
    expect(createLabel).toHaveBeenCalledWith({ name: 'Work' });
    expect(runtime.queryClient.getQueryData(labelCatalogQueryKeys.identity('identity-1'))).toEqual([
      label,
    ]);
    expect(
      runtime.queryClient.getQueryData(labelCatalogQueryKeys.identity('identity-2')),
    ).toBeUndefined();
    wrapper.unmount();
  });
});
