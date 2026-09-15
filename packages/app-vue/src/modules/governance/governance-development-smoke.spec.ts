/** @vitest-environment happy-dom */

import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import {
  CreateRuleSchema,
  UpdateRuleSchema,
  type CreateRuleReq,
  type GetRuleRevisionsQueryInput,
  type GetRuleReq,
  type ListRulesQueryInput,
  type RuleClientDTO,
  type RuleRevisionClientDTO,
  type SearchRulesQueryInput,
  type UpdateRuleReq,
} from '@memoflow/contracts/governance';
import type { GovernanceClientPort } from '@memoflow/governance/client';
import { RULE_SERVICE_KEY } from '../../di/keys';
import {
  createTestServerStateRuntime,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
} from '../../platform/server-state';
import enUS from '../../locales/en-US';
import GovernanceListView from './views/GovernanceListView.vue';
import GovernanceDetailView from './views/GovernanceDetailView.vue';
import RuleEditorView from './views/RuleEditorView.vue';
import RevisionHistoryView from './views/RevisionHistoryView.vue';

const RULE_ID = 'rule-governance-smoke' as RuleClientDTO['id'];
const AUTHOR_ID = 'identity-governance-smoke' as RuleClientDTO['authorId'];

class StatefulGovernanceSmokeClient implements GovernanceClientPort {
  private rule: RuleClientDTO | null = null;
  private readonly revisionLedger: RuleRevisionClientDTO[] = [];
  private clock = Date.parse('2026-09-11T12:00:00.000Z');

  async createRule(req: CreateRuleReq) {
    const parsed = CreateRuleSchema.parse(req);
    const createdAt = this.tick();
    this.rule = {
      id: RULE_ID,
      code: parsed.code,
      title: parsed.title,
      description: parsed.description,
      severity: parsed.severity,
      status: 'Draft',
      deprecationReason: null,
      replacementRuleId: null,
      liveReferenceLocation: parsed.liveReferenceLocation ?? null,
      tags: parsed.tags.map((value) => ({ value })),
      goodExamples: parsed.goodExamples.map((example, index) => ({
        id: `good-${index + 1}` as RuleClientDTO['goodExamples'][number]['id'],
        language: example.language,
        content: example.content,
        type: 'GoodExample',
        caption: example.caption ?? null,
      })),
      badExamples: parsed.badExamples.map((example, index) => ({
        id: `bad-${index + 1}` as RuleClientDTO['badExamples'][number]['id'],
        language: example.language,
        content: example.content,
        type: 'BadExample',
        caption: example.caption ?? null,
      })),
      authorId: AUTHOR_ID,
      createdAt,
      updatedAt: createdAt,
    };
    this.appendRevision('Created', [], {}, { title: this.rule.title });
    return ok(this.rule);
  }

  async getRule(req: GetRuleReq) {
    if (!this.rule) throw new Error('Smoke rule not found');
    if ('id' in req && req.id && req.id !== this.rule.id) throw new Error('Smoke rule not found');
    if ('code' in req && req.code && req.code !== this.rule.code)
      throw new Error('Smoke rule not found');
    return ok(this.rule);
  }

  async updateRule(ruleId: string, req: UpdateRuleReq) {
    if (!this.rule || ruleId !== this.rule.id) throw new Error('Smoke rule not found');
    const parsed = UpdateRuleSchema.parse(req);
    const previous = this.rule;
    const changedFields = Object.keys(parsed).filter((field) => {
      const key = field as keyof UpdateRuleReq;
      return JSON.stringify(previous[key as keyof RuleClientDTO]) !== JSON.stringify(parsed[key]);
    });
    this.rule = {
      ...previous,
      ...parsed,
      tags: parsed.tags ? parsed.tags.map((value) => ({ value })) : previous.tags,
      liveReferenceLocation:
        parsed.liveReferenceLocation === undefined
          ? previous.liveReferenceLocation
          : parsed.liveReferenceLocation,
      updatedAt: this.tick(),
    };
    this.appendRevision(
      'Updated',
      changedFields,
      { title: previous.title },
      { title: this.rule.title },
    );
    return ok(this.rule);
  }

  async deleteRule() {
    this.rule = null;
    return ok(null);
  }

  async listRules(query?: ListRulesQueryInput) {
    const items = this.rule ? [this.rule] : [];
    return ok({
      items,
      total: items.length,
      page: query?.page ?? 1,
      pageSize: query?.pageSize ?? 20,
    });
  }

  async searchRules(query: SearchRulesQueryInput) {
    const needle = query.query.toLowerCase();
    const items =
      this.rule && JSON.stringify(this.rule).toLowerCase().includes(needle) ? [this.rule] : [];
    return ok({
      items,
      total: items.length,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      searchTime: 0,
    });
  }

  async exportRuleBundle() {
    return ok({
      kind: 'memoflow.governance-rule-bundle' as const,
      schemaVersion: 1 as const,
      hashAlgorithm: 'sha256' as const,
      semanticHash: `sha256:${'0'.repeat(64)}`,
      rules: [],
    });
  }

  async getRevisions(query: GetRuleRevisionsQueryInput) {
    const items = query.ruleId === RULE_ID ? [...this.revisionLedger].reverse() : [];
    return ok({
      items,
      total: items.length,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
  }

  get revisions(): readonly RuleRevisionClientDTO[] {
    return this.revisionLedger;
  }

  private tick(): number {
    this.clock += 1_000;
    return this.clock;
  }

  private appendRevision(
    changeType: RuleRevisionClientDTO['changeType'],
    changedFields: string[],
    previousValues: Record<string, unknown>,
    newValues: Record<string, unknown>,
  ): void {
    this.revisionLedger.push({
      id: `revision-${this.revisionLedger.length + 1}` as RuleRevisionClientDTO['id'],
      ruleId: RULE_ID,
      revisionNumber: this.revisionLedger.length + 1,
      authorId: AUTHOR_ID,
      changedFields,
      previousValues,
      newValues,
      changeType,
      createdAt: this.tick(),
    });
  }
}

const TagInputSmokeStub = defineComponent({
  name: 'TagInput',
  emits: ['update:tags'],
  setup(_props, { emit }) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          'data-testid': 'governance-smoke-add-tag',
          onClick: () => emit('update:tags', ['reference-feature']),
        },
        'Add reference-feature tag',
      );
  },
});

async function settle(): Promise<void> {
  await flushPromises();
  await flushPromises();
}

async function mountWorkbench(service: GovernanceClientPort) {
  const runtime = createTestServerStateRuntime();
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance', name: 'governance-list', component: GovernanceListView },
      { path: '/governance/new', name: 'governance-editor', component: RuleEditorView },
      {
        path: '/governance/:id/edit',
        name: 'governance-editor-edit',
        component: RuleEditorView,
        props: true,
      },
      {
        path: '/governance/:id/history',
        name: 'governance-history',
        component: RevisionHistoryView,
        props: true,
      },
      {
        path: '/governance/:id',
        name: 'governance-detail',
        component: GovernanceDetailView,
        props: true,
      },
    ],
  });
  const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } });

  await router.push('/governance');
  await router.isReady();
  const wrapper = mount(
    defineComponent(() => () => h(RouterView)),
    {
      global: {
        plugins: [pinia, router, i18n, [VueQueryPlugin, { queryClient: runtime.queryClient }]],
        provide: {
          [RULE_SERVICE_KEY as symbol]: service,
          [SERVER_STATE_RUNTIME_KEY]: runtime,
          [SERVER_STATE_IDENTITY_SCOPE_KEY]: () => 'identity-governance-smoke',
        },
        stubs: { TagInput: TagInputSmokeStub },
      },
    },
  );
  await settle();
  return { wrapper, router, runtime };
}

describe('Governance development workbench smoke path (GOV-1902)', () => {
  it('opens list, creates and updates a rule, then observes the append-only revision history', async () => {
    const service = new StatefulGovernanceSmokeClient();
    const { wrapper, router, runtime } = await mountWorkbench(service);

    expect(wrapper.get('[data-testid="governance-list-view"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('0 rules');

    await wrapper.get('[data-testid="governance-new-rule"]').trigger('click');
    await settle();
    expect(router.currentRoute.value.name).toBe('governance-editor');

    const editor = wrapper.get('[data-scroll-host="governance-editor"]');
    await editor.get('input[placeholder="GOV-001"]').setValue('GOV-1902');
    await editor.get('input[placeholder="Rule title"]').setValue('Development workbench rule');
    const createTextareas = editor.findAll('textarea');
    await createTextareas[0]!.setValue(
      'A real Governance development surface must stay executable.',
    );
    await createTextareas[1]!.setValue('const referenceFeature = true;');
    await createTextareas[2]!.setValue('const deadNavigation = true;');
    await editor.get('[data-testid="governance-smoke-add-tag"]').trigger('click');
    await editor.get('form').trigger('submit');
    await settle();

    expect(router.currentRoute.value.name).toBe('governance-detail');
    expect(wrapper.text()).toContain('Development workbench rule');

    await router.push({ name: 'governance-editor-edit', params: { id: RULE_ID } });
    await settle();
    const editView = wrapper.get('[data-scroll-host="governance-editor"]');
    const titleInput = editView.get('input[placeholder="Rule title"]');
    await titleInput.setValue('Development workbench rule updated');
    await editView.get('form').trigger('submit');
    await settle();

    expect(router.currentRoute.value.name).toBe('governance-detail');
    expect(wrapper.text()).toContain('Development workbench rule updated');

    await router.push({ name: 'governance-history', params: { id: RULE_ID } });
    await settle();
    expect(wrapper.get('[data-scroll-host="governance-history"]').text()).toContain(
      'Revision History',
    );
    expect(wrapper.text()).toContain('v2');
    expect(wrapper.text()).toContain('Updated');
    expect(service.revisions).toHaveLength(2);
    expect(service.revisions[1]).toMatchObject({ revisionNumber: 2, changeType: 'Updated' });

    runtime.dispose();
  });
});
