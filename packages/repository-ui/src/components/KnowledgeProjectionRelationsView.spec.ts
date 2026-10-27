import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { ok, type Result } from '@memoflow/contracts/result';
import type { KnowledgeNoteLinkGraphResponse } from '@memoflow/repository-contracts';
import type { IRepositoryService } from '@repository-ui-test-host/di/types';
import { REPOSITORY_SERVICE_KEY } from '@repository-ui-test-host/di/keys';
import KnowledgeProjectionRelationsView from './KnowledgeProjectionRelationsView.vue';

const messages = {
  common: { retry: 'Retry' },
  repository: {
    projection: {
      graphDepth: 'Depth',
      graphTruncated: 'Partial graph',
      graphSummary: '{nodes} notes · {edges} links',
      refreshRelations: 'Refresh relations',
      outgoingLinks: 'Outgoing links',
      noOutgoingLinks: 'No outgoing links',
      backlinks: 'Backlinks',
      noBacklinks: 'No backlinks',
      relatedNotes: 'Related notes',
      noRelatedNotes: 'No related notes',
      unresolvedLinks: 'Unresolved links',
      noUnresolvedLinks: 'No unresolved links',
      ambiguousLink: 'Ambiguous link',
      missingLink: 'Missing link',
      depthValue: 'depth {depth}',
    },
  },
};

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': messages },
});

const ButtonStub = defineComponent({
  props: ['disabled'],
  setup(props, { attrs, slots }) {
    return () =>
      h('button', { ...attrs, type: 'button', disabled: props.disabled }, slots.default?.());
  },
});

const BadgeStub = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('span', attrs, slots.default?.());
  },
});

function graph(centerProjectionId = 'center'): KnowledgeNoteLinkGraphResponse {
  return {
    centerProjectionId,
    depth: 1,
    nodes: [
      {
        projectionId: centerProjectionId,
        title: centerProjectionId === 'center' ? 'Center' : 'Second center',
        relativePath: centerProjectionId === 'center' ? 'Center.md' : 'Second.md',
        depth: 0,
        isCenter: true,
        outgoingLinkCount: 2,
        backlinkCount: 1,
      },
      {
        projectionId: 'target',
        title: centerProjectionId === 'center' ? 'First related note' : 'Second related note',
        relativePath: centerProjectionId === 'center' ? 'First.md' : 'Second.md',
        depth: 1,
        isCenter: false,
        outgoingLinkCount: 0,
        backlinkCount: 1,
      },
      {
        projectionId: 'source',
        title: 'Source',
        relativePath: 'Source.md',
        depth: 1,
        isCenter: false,
        outgoingLinkCount: 1,
        backlinkCount: 0,
      },
    ],
    edges: [
      {
        id: 'edge-out',
        sourceProjectionId: centerProjectionId,
        targetProjectionId: 'target',
        target: 'Target',
        alias: null,
        section: null,
        displayText: 'Target',
        context: 'See [[Target]].',
        embedded: false,
      },
      {
        id: 'edge-back',
        sourceProjectionId: 'source',
        targetProjectionId: centerProjectionId,
        target: 'Center',
        alias: null,
        section: null,
        displayText: 'Center',
        context: 'References [[Center]].',
        embedded: false,
      },
    ],
    unresolvedLinks: [
      {
        id: 'missing',
        sourceProjectionId: centerProjectionId,
        target: 'Missing',
        alias: null,
        section: null,
        displayText: 'Missing',
        context: 'See [[Missing]].',
        embedded: false,
        reason: 'not_found',
      },
    ],
    truncated: false,
  };
}

function mountRelations(service: IRepositoryService, projectionId = 'center') {
  return mount(KnowledgeProjectionRelationsView, {
    props: { projectionId },
    global: {
      plugins: [i18n],
      provide: { [REPOSITORY_SERVICE_KEY as symbol]: service },
      stubs: {
        Badge: BadgeStub,
        Button: ButtonStub,
        ArrowUpRight: true,
        CornerDownLeft: true,
        Loader2: true,
        Network: true,
        RefreshCw: true,
        Unlink: true,
      },
    },
  });
}

describe('KnowledgeProjectionRelationsView', () => {
  it('loads direct links, backlinks, unresolved links, and changes graph depth', async () => {
    const getKnowledgeNoteLinkGraph = vi.fn(async (_id, request) =>
      ok({ ...graph(), depth: request?.depth ?? 1 }),
    );
    const wrapper = mountRelations({
      getKnowledgeNoteLinkGraph,
    } as unknown as IRepositoryService);
    await flushPromises();

    expect(getKnowledgeNoteLinkGraph).toHaveBeenCalledWith('center', {
      depth: 1,
      maxNodes: 40,
    });
    expect(wrapper.text()).toContain('First related note');
    expect(wrapper.text()).toContain('Source');
    expect(wrapper.text()).toContain('Missing link');

    await wrapper.get('[data-testid="knowledge-projection-depth-2"]').trigger('click');
    await flushPromises();
    expect(getKnowledgeNoteLinkGraph).toHaveBeenLastCalledWith('center', {
      depth: 2,
      maxNodes: 40,
    });

    await wrapper.get('[data-testid="knowledge-projection-graph-node-target"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['target']]);
  });

  it('ignores a stale graph response after the selected projection changes', async () => {
    let resolveFirst!: (value: Result<KnowledgeNoteLinkGraphResponse>) => void;
    const first = new Promise<Result<KnowledgeNoteLinkGraphResponse>>((resolve) => {
      resolveFirst = resolve;
    });
    const getKnowledgeNoteLinkGraph = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(ok(graph('second')));
    const wrapper = mountRelations(
      { getKnowledgeNoteLinkGraph } as unknown as IRepositoryService,
      'center',
    );

    await wrapper.setProps({ projectionId: 'second' });
    await flushPromises();
    resolveFirst(ok(graph('center')));
    await flushPromises();

    expect(wrapper.text()).toContain('Second related note');
    expect(wrapper.text()).not.toContain('First related note');
  });
});
