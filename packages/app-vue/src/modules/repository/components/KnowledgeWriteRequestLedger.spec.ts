import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import type {
  KnowledgeWriteRequestClientDTO,
  ListKnowledgeWriteRequestsRes,
} from '@memoflow/repository-contracts';
import { REPOSITORY_SERVICE_KEY } from '../../../di/keys';
import KnowledgeWriteRequestLedger from './KnowledgeWriteRequestLedger.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { loading: 'Loading...' },
      repository: {
        writeRequestLedger: {
          title: 'Write request ledger',
          description: 'Ledger description',
          refresh: 'Refresh',
          empty: 'No write requests',
          commitStatus: 'Commit: {status}',
          projectionStatus: 'Projection: {status}',
          commitSha: '{sha}',
          projectionAttempts: '{count} attempt(s)',
          replay: 'Replay',
          replaying: 'Replaying...',
          replayed: 'Replayed → {status}',
          errorTitle: 'Ledger error',
          loadFailed: 'Failed to load write requests',
        },
      },
    },
  },
});

const PassthroughStub = defineComponent({
  name: 'PassthroughStub',
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.());
  },
});

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  props: ['disabled'],
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          disabled: props.disabled,
          onClick: () => emit('click'),
        },
        slots.default?.(),
      );
  },
});

const IconStub = defineComponent({
  name: 'IconStub',
  setup(_, { attrs }) {
    return () => h('i', attrs);
  },
});

function createRow(
  overrides: Partial<KnowledgeWriteRequestClientDTO> = {},
): KnowledgeWriteRequestClientDTO {
  return {
    id: 'wr-1',
    connectionId: 'conn-1',
    requestId: 'req-1',
    relativePath: 'notes/welcome.md',
    status: 'Committed',
    commitSha: 'abcdef1234567890',
    errorCode: null,
    errorMessage: null,
    projectionStatus: 'Pending',
    projectionErrorCode: null,
    projectionErrorMessage: null,
    projectionAttempts: 1,
    projectedAt: null,
    createdAt: 1,
    updatedAt: 2,
    completedAt: 2,
    ...overrides,
  };
}

function createService(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  return {
    listKnowledgeWriteRequests: vi.fn(),
    replayKnowledgeWriteRequestProjection: vi.fn(),
    ...overrides,
  };
}

function mountLedger(
  service: ReturnType<typeof createService>,
  props: { connectionId?: string } = {},
) {
  return mount(KnowledgeWriteRequestLedger, {
    props,
    global: {
      plugins: [i18n],
      provide: {
        [REPOSITORY_SERVICE_KEY as symbol]: service,
      },
      stubs: {
        Button: ButtonStub,
        Badge: PassthroughStub,
        Alert: PassthroughStub,
        AlertDescription: PassthroughStub,
        AlertTitle: PassthroughStub,
        AlertCircle: IconStub,
        RefreshCw: IconStub,
        RotateCcw: IconStub,
        Loader2: IconStub,
      },
    },
  });
}

describe('KnowledgeWriteRequestLedger (W6 P1-1 ledger/replay UI)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders commit and projection statuses for every write request from the server ledger', async () => {
    const service = createService({
      listKnowledgeWriteRequests: vi.fn().mockResolvedValue(
        ok<ListKnowledgeWriteRequestsRes>({
          writeRequests: [
            createRow({
              id: 'wr-succeeded',
              projectionStatus: 'Succeeded',
              projectedAt: 5,
              projectionAttempts: 2,
            }),
            createRow({
              id: 'wr-failed',
              projectionStatus: 'Failed',
              projectionErrorCode: 'PROJECTION_ERROR',
              projectionErrorMessage: 'applyChanges crashed',
              projectionAttempts: 3,
            }),
          ],
        }),
      ),
    });
    const wrapper = mountLedger(service);
    await flushPromises();

    expect(service.listKnowledgeWriteRequests).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[data-testid="ledger-row-wr-succeeded"]').text()).toContain(
      'Projection: Succeeded',
    );
    expect(wrapper.get('[data-testid="ledger-row-wr-failed"]').text()).toContain(
      'Projection: Failed',
    );
    expect(wrapper.get('[data-testid="ledger-row-wr-failed"]').text()).toContain('3 attempt(s)');
    // Failed projection exposes the actionable server error.
    expect(wrapper.get('[data-testid="ledger-projection-error"]').text()).toContain(
      'applyChanges crashed',
    );
    // Replay is offered only for replayable (Pending/Failed) projections.
    expect(
      wrapper
        .find('[data-testid="ledger-row-wr-succeeded"] [data-testid="ledger-replay-button"]')
        .exists(),
    ).toBe(false);
    expect(
      wrapper
        .find('[data-testid="ledger-row-wr-failed"] [data-testid="ledger-replay-button"]')
        .exists(),
    ).toBe(true);
  });

  it('refreshes from the server when the refresh button is pressed', async () => {
    const service = createService({
      listKnowledgeWriteRequests: vi
        .fn()
        .mockResolvedValue(ok<ListKnowledgeWriteRequestsRes>({ writeRequests: [createRow()] })),
    });
    const wrapper = mountLedger(service);
    await flushPromises();
    expect(service.listKnowledgeWriteRequests).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-testid="ledger-refresh-button"]').trigger('click');
    await flushPromises();
    expect(service.listKnowledgeWriteRequests).toHaveBeenCalledTimes(2);
  });

  it('replays a Pending projection and re-reads the ledger so the UI matches the server', async () => {
    let first = true;
    const service = createService({
      listKnowledgeWriteRequests: vi.fn().mockImplementation(() => {
        const rows = first
          ? [createRow({ id: 'wr-pending', projectionStatus: 'Pending' })]
          : [
              createRow({
                id: 'wr-pending',
                projectionStatus: 'Succeeded',
                projectedAt: 9,
                projectionAttempts: 2,
              }),
            ];
        first = false;
        return Promise.resolve(ok<ListKnowledgeWriteRequestsRes>({ writeRequests: rows }));
      }),
      replayKnowledgeWriteRequestProjection: vi
        .fn()
        .mockResolvedValue(
          ok({ writeRequestId: 'wr-pending', commitSha: 'abcdef1234567890', status: 'Succeeded' }),
        ),
    });
    const wrapper = mountLedger(service);
    await flushPromises();
    expect(wrapper.get('[data-testid="ledger-row-wr-pending"]').text()).toContain(
      'Projection: Pending',
    );

    await wrapper
      .get('[data-testid="ledger-row-wr-pending"] [data-testid="ledger-replay-button"]')
      .trigger('click');
    await flushPromises();

    expect(service.replayKnowledgeWriteRequestProjection).toHaveBeenCalledWith('wr-pending');
    expect(wrapper.get('[data-testid="ledger-replay-message"]').text()).toContain('Succeeded');
    // After replay the ledger is re-read: the same row is now Succeeded in the UI.
    expect(wrapper.get('[data-testid="ledger-row-wr-pending"]').text()).toContain(
      'Projection: Succeeded',
    );
    // Succeeded rows no longer offer replay.
    expect(
      wrapper
        .find('[data-testid="ledger-row-wr-pending"] [data-testid="ledger-replay-button"]')
        .exists(),
    ).toBe(false);
  });

  it('surfaces an actionable error when replay fails', async () => {
    const service = createService({
      listKnowledgeWriteRequests: vi.fn().mockResolvedValue(
        ok<ListKnowledgeWriteRequestsRes>({
          writeRequests: [createRow({ id: 'wr-pending', projectionStatus: 'Failed' })],
        }),
      ),
      replayKnowledgeWriteRequestProjection: vi
        .fn()
        .mockResolvedValue(fail({ code: 'CONFLICT', message: 'Repository is busy' })),
    });
    const wrapper = mountLedger(service);
    await flushPromises();

    await wrapper
      .get('[data-testid="ledger-row-wr-pending"] [data-testid="ledger-replay-button"]')
      .trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="ledger-error"]').text()).toContain('Repository is busy');
  });

  it('passes the connection id when provided so the ledger is scoped to one connection', async () => {
    const service = createService({
      listKnowledgeWriteRequests: vi
        .fn()
        .mockResolvedValue(ok<ListKnowledgeWriteRequestsRes>({ writeRequests: [] })),
    });
    const wrapper = mountLedger(service, { connectionId: 'conn-42' });
    await flushPromises();

    expect(service.listKnowledgeWriteRequests).toHaveBeenCalledWith({
      connectionId: 'conn-42',
      limit: 50,
    });
    expect(wrapper.get('[data-testid="ledger-empty"]').text()).toContain('No write requests');
  });
});
