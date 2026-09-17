/**
 * Dual registry suite (elegance E3b tax cut).
 * Merged 20 dual-retired surface locks from this directory.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 * Sources: agent-citation-dual.surface.spec.ts, ai-chat-list-res-dual.surface.spec.ts, ai-conversation-client-dto-dual.surface.spec.ts, ai-model-info-dual.surface.spec.ts, ai-provider-config-client-dto-dual.surface.spec.ts, ai-response-res-dual.surface.spec.ts, conversation-name-dual.surface.spec.ts, generate-goal-automation-res-dual.surface.spec.ts, goal-automation-plan-dual.surface.spec.ts, goal-generation-draft-dual.surface.spec.ts, goal-workflow-result-dual.surface.spec.ts, knowledge-citation-dual.surface.spec.ts, knowledge-note-persisted-ref-dual.surface.spec.ts, message-client-dto-dual.surface.spec.ts, provider-create-schema-dual.surface.spec.ts, provider-summary-dual.surface.spec.ts, provider-test-result-dual.surface.spec.ts, reindex-knowledge-res-dual.surface.spec.ts, stream-message-done-payload-dual.surface.spec.ts, token-usage-dual.surface.spec.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// --- merged from ai-chat-list-res-dual.surface.spec.ts ---
{
  /**
   * Residual 691: AI chat list response dual bodies retired.
   * ConversationListRes / MessageListRes reuse *ListResSchema only (ClientDTO items).
   * Soft residual 807: MessageClientDTO dual retired via MessageClientDTOSchema
   * (see message-client-dto-dual surface; not asserted here to avoid dual-surface lock drift).
   * Soft residual 809: AIConversationClientDTO dual retired via AIConversationClientDTOSchema
   * (see ai-conversation-client-dto-dual surface).
   */
  describe('ai chat list response dual retired (residual 691)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const dto = readFileSync(resolve(apiDir, 'ai-chat.dto.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../ai/src/api/routes/ai-chat.routes.ts'),
      'utf8',
    );

    it('exports list Res schemas with ClientDTO item arrays', () => {
      expect(responseSchemas).toContain('Residual 691');
      expect(responseSchemas).toContain('export const ConversationListResSchema');
      expect(responseSchemas).toContain('export const MessageListResSchema');
      expect(responseSchemas).toContain('data: z.array(AIConversationClientDTOSchema)');
      expect(responseSchemas).toContain('data: z.array(MessageClientDTOSchema)');
    });

    it('semantic list Res types are z.infer aliases without interface dual bodies', () => {
      expect(dto).toContain('Residual 691');
      expect(dto).toContain(
        'export type ConversationListRes = z.infer<typeof ConversationListResSchema>',
      );
      expect(dto).toContain('export type MessageListRes = z.infer<typeof MessageListResSchema>');
      expect(dto).not.toMatch(/export interface ConversationListRes\b/);
      expect(dto).not.toMatch(/export interface MessageListRes\b/);
    });

    it('keeps conversation-shell list on chat routes while message history belongs to Mastra', () => {
      const runtimeRoutes = readFileSync(
        resolve(apiDir, '../../../../../ai/src/api/routes/ai-runtime.routes.ts'),
        'utf8',
      );
      expect(routes).toContain('ConversationListResSchema');
      expect(routes).toContain('successResponse(ConversationListResSchema');
      expect(routes).not.toContain('MessageListResSchema');
      expect(runtimeRoutes).toContain('AssistantRuntimeHistoryViewSchema');
      expect(runtimeRoutes).toContain("router.post('/assistant/history'");
    });
  });
}

// --- merged from ai-conversation-client-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 809: AIConversationClientDTO dual body retired.
   * Sole AIConversationClientDTOSchema + z.infer; identityId branded; nests MessageClientDTOSchema.
   */
  describe('ai conversation client dto dual retired (residual 809)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const aggregate = readFileSync(
      resolve(apiDir, '../aggregates/ai-conversation-client.ts'),
      'utf8',
    );
    const routes = readFileSync(
      resolve(apiDir, '../../../../../ai/src/api/routes/ai-chat.routes.ts'),
      'utf8',
    );

    it('owns AIConversationClientDTO as z.infer of AIConversationClientDTOSchema', () => {
      expect(aggregate).toContain('Residual 809');
      expect(aggregate).toContain("from '../api/response-schemas'");
      expect(aggregate).toContain(
        'export type AIConversationClientDTO = z.infer<typeof AIConversationClientDTOSchema>',
      );
      expect(aggregate).not.toMatch(/export interface AIConversationClientDTO\b/);
    });

    it('AIConversationClientDTOSchema brands identityId and nests MessageClientDTOSchema', () => {
      expect(responseSchemas).toContain('Residual 809');
      expect(responseSchemas).toContain('export const AIConversationClientDTOSchema = z.object({');
      expect(responseSchemas).toContain('identityId: brandedId<IdentityId>()');
      expect(responseSchemas).toContain('messages: z.array(MessageClientDTOSchema).nullable()');
      expect(responseSchemas).toContain('lastMessageAt: z.number().nullable()');
    });

    it('OpenAPI chat routes use AIConversationClientDTOSchema', () => {
      expect(routes).toContain('AIConversationClientDTOSchema');
      const hits = routes.split('AIConversationClientDTOSchema').length - 1;
      expect(hits).toBeGreaterThanOrEqual(2);
    });
  });
}

// --- merged from ai-model-info-dual.surface.spec.ts ---
{
  /**
   * Residual 751: AI model-info dual body retired.
   * Soft residual 811: response-schemas re-exports AIModelInfoSchema with ClientDTOSchema.
   * AIModelInfo reuses AIModelInfoSchema only.
   */
  describe('ai model-info dual retired (residual 751)', () => {
    const apiDir = __dirname;
    const aggregate = readFileSync(
      resolve(apiDir, '../aggregates/ai-provider-config-client.ts'),
      'utf8',
    );
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');

    it('exports AIModelInfoSchema as sole shape from aggregate module', () => {
      expect(aggregate).toContain('Residual 751');
      expect(aggregate).toContain('export const AIModelInfoSchema = z.object({');
    });

    it('semantic type is z.infer alias without interface dual body', () => {
      expect(aggregate).toContain('export type AIModelInfo = z.infer<typeof AIModelInfoSchema>');
      expect(aggregate).not.toMatch(/export interface AIModelInfo\b/);
    });

    it('response-schemas re-exports aggregate-owned schema (no local dual body)', () => {
      expect(responseSchemas).toContain('Residual 751');
      expect(responseSchemas).toContain('Residual 811');
      expect(responseSchemas).toContain("from '../aggregates/ai-provider-config-client'");
      expect(responseSchemas).toContain(
        'export { AIModelInfoSchema, AIProviderConfigClientDTOSchema }',
      );
      expect(responseSchemas).not.toMatch(/const AIModelInfoSchema = z\.object\(\{/);
      // Provider V2: dynamic model inventory is a transient catalog snapshot, never Provider aggregate truth.
      expect(aggregate).not.toContain('availableModels: z.array(AIModelInfoSchema)');
    });
  });
}

// --- merged from ai-provider-config-client-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 811: AIProviderConfigClientDTO dual body retired.
   * Sole AIProviderConfigClientDTOSchema + z.infer owned by aggregates (branded identityId).
   * response-schemas re-exports schema for OpenAPI list/get envelopes.
   */
  describe('ai provider config client dto dual retired (residual 811)', () => {
    const apiDir = __dirname;
    const aggregate = readFileSync(
      resolve(apiDir, '../aggregates/ai-provider-config-client.ts'),
      'utf8',
    );
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../ai/src/api/routes/ai-provider.routes.ts'),
      'utf8',
    );

    it('owns ClientDTO as z.infer of ClientDTOSchema in aggregates', () => {
      expect(aggregate).toContain('Residual 811');
      expect(aggregate).toContain('export const AIProviderConfigClientDTOSchema = z.object({');
      expect(aggregate).toContain(
        'export type AIProviderConfigClientDTO = z.infer<typeof AIProviderConfigClientDTOSchema>',
      );
      expect(aggregate).toContain('identityId: brandedId<IdentityId>()');
      expect(aggregate).toContain('apiKeyMasked: z.string()');
      expect(aggregate).not.toMatch(/export interface AIProviderConfigClientDTO\b/);
      expect(aggregate).not.toMatch(/apiKey:\s/);
    });

    it('response-schemas re-exports ClientDTOSchema without local dual body', () => {
      expect(responseSchemas).toContain('Residual 811');
      expect(responseSchemas).toContain(
        'export { AIModelInfoSchema, AIProviderConfigClientDTOSchema }',
      );
      expect(responseSchemas).not.toMatch(
        /export const AIProviderConfigClientDTOSchema = z\.object\(\{/,
      );
      expect(responseSchemas).toContain('data: z.array(AIProviderConfigClientDTOSchema)');
    });

    it('OpenAPI provider routes use AIProviderConfigClientDTOSchema', () => {
      expect(routes).toContain('AIProviderConfigClientDTOSchema');
      const hits = routes.split('AIProviderConfigClientDTOSchema').length - 1;
      expect(hits).toBeGreaterThanOrEqual(3);
    });
  });
}

// --- merged from ai-response-res-dual.surface.spec.ts ---
{
  /**
   * Residual 695: AI response dual bodies retired.
   * SendMessage / ListAIProviderConfigs / QueryAnalytics / QueryKnowledge /
   * ExpandKnowledge / CreateKnowledgeNote *Res reuse *ResSchema only.
   */
  describe('ai response res duals retired (residual 695)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const chat = readFileSync(resolve(apiDir, 'ai-chat.dto.ts'), 'utf8');
    const provider = readFileSync(resolve(apiDir, 'ai-provider-config.dto.ts'), 'utf8');
    const analytics = readFileSync(resolve(apiDir, 'ai-analytics-query.dto.ts'), 'utf8');
    const knowledge = readFileSync(resolve(apiDir, 'ai-knowledge-query.dto.ts'), 'utf8');
    const expansion = readFileSync(resolve(apiDir, 'ai-knowledge-expansion.dto.ts'), 'utf8');
    const note = readFileSync(resolve(apiDir, 'ai-knowledge-note.dto.ts'), 'utf8');

    it('exports response schemas used by OpenAPI routes', () => {
      expect(responseSchemas).toContain('Residual 695');
      expect(responseSchemas).toContain('export const SendMessageResSchema');
      expect(responseSchemas).toContain('export const ListAIProviderConfigsResSchema');
      expect(responseSchemas).toContain('export const QueryAnalyticsResSchema');
      expect(responseSchemas).toContain('export const QueryKnowledgeResSchema');
      expect(responseSchemas).toContain('export const ExpandKnowledgeResSchema');
      expect(responseSchemas).toContain('export const CreateKnowledgeNoteResSchema');
    });

    it('semantic Res types are z.infer aliases without interface dual bodies', () => {
      expect(chat).toContain('Residual 695');
      expect(chat).toContain('export type SendMessageRes = z.infer<typeof SendMessageResSchema>');
      expect(chat).not.toMatch(/export interface SendMessageRes\b/);

      expect(provider).toContain('Residual 695');
      expect(provider).toContain(
        'export type ListAIProviderConfigsRes = z.infer<typeof ListAIProviderConfigsResSchema>',
      );
      expect(provider).not.toMatch(/export interface ListAIProviderConfigsRes\b/);

      expect(analytics).toContain('Residual 695');
      expect(analytics).toContain(
        'export type QueryAnalyticsRes = z.infer<typeof QueryAnalyticsResSchema>',
      );
      expect(analytics).not.toMatch(/export interface QueryAnalyticsRes\b/);

      expect(knowledge).toContain('Residual 695');
      expect(knowledge).toContain(
        'export type QueryKnowledgeRes = z.infer<typeof QueryKnowledgeResSchema>',
      );
      expect(knowledge).not.toMatch(/export interface QueryKnowledgeRes\b/);

      expect(expansion).toContain('Residual 695');
      expect(expansion).toContain(
        'export type ExpandKnowledgeRes = z.infer<typeof ExpandKnowledgeResSchema>',
      );
      expect(expansion).not.toMatch(/export interface ExpandKnowledgeRes\b/);

      expect(note).toContain('Residual 695');
      expect(note).toContain(
        'export type CreateKnowledgeNoteRes = z.infer<typeof CreateKnowledgeNoteResSchema>',
      );
      expect(note).not.toMatch(/export interface CreateKnowledgeNoteRes\b/);
    });

    it('OpenAPI AI routes reference the shared response schemas', () => {
      const chatRoutes = readFileSync(
        resolve(apiDir, '../../../../../ai/src/api/routes/ai-chat.routes.ts'),
        'utf8',
      );
      const providerRoutes = readFileSync(
        resolve(apiDir, '../../../../../ai/src/api/routes/ai-provider.routes.ts'),
        'utf8',
      );
      const analyticsRoutes = readFileSync(
        resolve(apiDir, '../../../../../ai/src/api/routes/ai-analytics-query.routes.ts'),
        'utf8',
      );
      const knowledgeRoutes = readFileSync(
        resolve(apiDir, '../../../../../ai/src/api/routes/ai-knowledge-query.routes.ts'),
        'utf8',
      );
      const runtimeRoutes = readFileSync(
        resolve(apiDir, '../../../../../ai/src/api/routes/ai-runtime.routes.ts'),
        'utf8',
      );

      expect(chatRoutes).not.toContain('SendMessageResSchema');
      expect(runtimeRoutes).toContain('AssistantRuntimeHistoryViewSchema');
      expect(providerRoutes).toContain('ListAIProviderConfigsResSchema');
      expect(analyticsRoutes).toContain('QueryAnalyticsResSchema');
      expect(knowledgeRoutes).toContain('QueryKnowledgeResSchema');
      expect(knowledgeRoutes).toContain('ExpandKnowledgeResSchema');
    });
  });
}

// --- merged from conversation-name-dual.surface.spec.ts ---
{
  /**
   * Residual 673: AI conversation create/update name body dual retired.
   * Both ops use ConversationNameSchema only.
   */
  describe('ai conversation name request dual retired (residual 673)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'ai-chat.dto.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../ai/src/api/routes/ai-chat.routes.ts'),
      'utf8',
    );
    const controller = readFileSync(
      resolve(apiDir, '../../../../../ai/src/server/transport/ai-chat.controller.ts'),
      'utf8',
    );

    it('exports a single shared conversation name schema', () => {
      expect(dto).toContain('Residual 673');
      expect(dto).toContain('export const ConversationNameSchema');
      expect(dto).toContain(
        'export type CreateConversationReq = z.infer<typeof ConversationNameSchema>',
      );
      expect(dto).toContain(
        'export type UpdateConversationReq = z.infer<typeof ConversationNameSchema>',
      );
      expect(dto).not.toMatch(/export const CreateConversationSchema\b/);
      expect(dto).not.toMatch(/export const UpdateConversationSchema\b/);
    });

    it('routes and controller parse ConversationNameSchema for create and update', () => {
      expect(routes).toContain('ConversationNameSchema');
      expect(routes).not.toContain('CreateConversationSchema');
      expect(routes).not.toContain('UpdateConversationSchema');
      expect(controller).toContain('ConversationNameSchema');
      expect(controller).not.toContain('CreateConversationSchema');
      expect(controller).not.toContain('UpdateConversationSchema');
      const routeHits = routes.split('schema: ConversationNameSchema').length - 1;
      expect(routeHits).toBeGreaterThanOrEqual(2);
      const parseHits = controller.split('ConversationNameSchema.safeParse').length - 1;
      expect(parseHits).toBeGreaterThanOrEqual(2);
    });
  });
}

// --- merged from knowledge-citation-dual.surface.spec.ts ---
{
  /**
   * Residual 755: KnowledgeCitation dual body retired.
   * response-schemas owns KnowledgeCitationSchema; dto keeps z.infer type alias only.
   */
  describe('knowledge citation dual retired (residual 755)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const knowledge = readFileSync(resolve(apiDir, 'ai-knowledge-query.dto.ts'), 'utf8');

    it('response-schemas owns the sole citation schema body', () => {
      expect(responseSchemas).toContain('Residual 755');
      expect(responseSchemas).toContain('export const KnowledgeCitationSchema = z.object({');
      expect(responseSchemas).not.toMatch(/const KnowledgeCitationResSchema\s*=\s*z\.object\(\{/);
      expect(responseSchemas).toContain('citations: z.array(KnowledgeCitationSchema)');
    });

    it('dto type is z.infer alias without local dual schema body', () => {
      expect(knowledge).toContain('Residual 755');
      expect(knowledge).toContain(
        "KnowledgeCitationSchema,\n  QueryKnowledgeResSchema,\n} from './response-schemas'",
      );
      expect(knowledge).toContain(
        'export type KnowledgeCitation = z.infer<typeof KnowledgeCitationSchema>',
      );
      expect(knowledge).not.toMatch(/export const KnowledgeCitationSchema\s*=\s*z\.object\(\{/);
    });

    it('Query/Expand knowledge responses nest the shared citation schema', () => {
      expect(responseSchemas).toContain('export const QueryKnowledgeResSchema');
      expect(responseSchemas).toContain('export const ExpandKnowledgeResSchema');
      expect(knowledge).not.toContain('chunkIndex: z.number().int().nonnegative()');
    });
  });
}

// --- merged from knowledge-note-persisted-ref-dual.surface.spec.ts ---
{
  /**
   * Residual 723: knowledge note persisted-ref dual body retired.
   * KnowledgeNotePersistedRef reuses KnowledgeNotePersistedRefSchema only.
   */
  describe('knowledge note persisted-ref dual retired (residual 723)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'ai-knowledge-note.dto.ts'), 'utf8');
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const resSurface = readFileSync(resolve(apiDir, 'dual-registry.surface.spec.ts'), 'utf8');

    it('exports KnowledgeNotePersistedRefSchema as sole persisted-ref shape', () => {
      expect(responseSchemas).toContain('Residual 723');
      expect(responseSchemas).toContain(
        'export const KnowledgeNotePersistedRefSchema = z.object({',
      );
    });

    it('semantic type is z.infer alias without interface dual body', () => {
      expect(dto).toContain('Residual 723');
      expect(dto).toContain(
        'export type KnowledgeNotePersistedRef = z.infer<typeof KnowledgeNotePersistedRefSchema>',
      );
      expect(dto).not.toMatch(/export interface KnowledgeNotePersistedRef\b/);
    });

    it('CreateKnowledgeNoteRes still nests KnowledgeNotePersistedRefSchema note', () => {
      expect(responseSchemas).toContain('note: KnowledgeNotePersistedRefSchema');
      expect(dto).toContain(
        'export type CreateKnowledgeNoteRes = z.infer<typeof CreateKnowledgeNoteResSchema>',
      );
      // residual 695 surface remains for CreateKnowledgeNoteRes dual
      expect(resSurface).toContain('CreateKnowledgeNoteResSchema');
    });
  });
}

// --- merged from message-client-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 807: MessageClientDTO dual body retired.
   * Sole MessageClientDTOSchema + z.infer (UI computed fields included).
   */
  describe('message client dto dual retired (residual 807)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const entity = readFileSync(resolve(apiDir, '../entities/message-client.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../ai/src/api/routes/ai-chat.routes.ts'),
      'utf8',
    );

    it('owns MessageClientDTO as z.infer of MessageClientDTOSchema', () => {
      expect(entity).toContain('Residual 807');
      expect(entity).toContain("from '../api/response-schemas'");
      expect(entity).toContain(
        'export type MessageClientDTO = z.infer<typeof MessageClientDTOSchema>',
      );
      expect(entity).not.toMatch(/export interface MessageClientDTO\b/);
    });

    it('MessageClientDTOSchema owns transport + UI computed fields', () => {
      expect(responseSchemas).toContain('Residual 807');
      expect(responseSchemas).toContain('export const MessageClientDTOSchema = z.object({');
      expect(responseSchemas).toContain('tokenCount: z.number().nullable()');
      expect(responseSchemas).toContain('isUser: z.boolean()');
      expect(responseSchemas).toContain('isAssistant: z.boolean()');
      expect(responseSchemas).toContain('isSystem: z.boolean()');
      expect(responseSchemas).toContain('formattedTime: z.string()');
    });

    it('keeps the legacy DTO shape isolated from the conversation-shell route', () => {
      const runtimeRoutes = readFileSync(
        resolve(apiDir, '../../../../../ai/src/api/routes/ai-runtime.routes.ts'),
        'utf8',
      );
      expect(responseSchemas).toContain('data: z.array(MessageClientDTOSchema)');
      expect(responseSchemas).toContain('userMessage: MessageClientDTOSchema');
      expect(responseSchemas).toContain('assistantMessage: MessageClientDTOSchema');
      expect(routes).not.toContain('MessageListResSchema');
      expect(runtimeRoutes).toContain('AssistantRuntimeHistoryViewSchema');
    });
  });
}

// --- Provider onboarding V2 single write path ---
{
  describe('ai provider onboarding V2 owns the only credential-bearing create path', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'ai-provider-config.dto.ts'), 'utf8');
    const onboardingDto = readFileSync(resolve(apiDir, 'ai-provider-onboarding.dto.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../ai/src/api/routes/ai-provider.routes.ts'),
      'utf8',
    );
    const controller = readFileSync(
      resolve(apiDir, '../../../../../ai/src/server/transport/ai-provider-config.controller.ts'),
      'utf8',
    );

    it('retires the legacy raw-secret create schema', () => {
      expect(dto).not.toContain('CreateAIProviderConfigSchema');
      expect(dto).not.toContain('CreateAIProviderConfigReq');
      expect(onboardingDto).toContain('CommitAIProviderOnboardingSchema');
      const commitBlock = onboardingDto.slice(
        onboardingDto.indexOf('export const CommitAIProviderOnboardingSchema'),
        onboardingDto.indexOf('export type CommitAIProviderOnboardingReq'),
      );
      expect(commitBlock).toContain('onboardingId: z.string().min(16)');
      expect(commitBlock).not.toContain('apiKey:');
    });

    it('routes POST /providers through the one-time onboarding commit only', () => {
      expect(routes).toContain('schema: CommitAIProviderOnboardingSchema');
      expect(routes).not.toContain('CreateAIProviderConfigSchema');
      expect(controller).toContain('CommitAIProviderOnboardingSchema.safeParse(input)');
      expect(controller).not.toContain('CreateAIProviderConfigSchema');
    });
  });
}

// --- merged from provider-summary-dual.surface.spec.ts ---
{
  /**
   * Residual 647: retire zero-consumer Summary dual-track surfaces.
   * Provider list uses full AIProviderConfigClientDTO; Goal keeps its
   * canonical ClientDTO surface.
   * Soft residual 811: AIProviderConfigClientDTO dual retired via ClientDTOSchema
   * (see ai-provider-config-client-dto-dual surface; assertion updated below).
   * Soft residual 819: GoalClientDTO dual retired via GoalClientDTOSchema
   * (see goal-aggregate-client-dto-dual surface; assertion updated below).
   */
  describe('contracts summary dual single-track surface (residual 647)', () => {
    const aiApi = __dirname;
    const modules = resolve(aiApi, '../..');

    it('retires AIProviderConfigSummary interface dual', () => {
      const client = readFileSync(
        resolve(aiApi, '../aggregates/ai-provider-config-client.ts'),
        'utf8',
      );
      const index = readFileSync(resolve(aiApi, '../aggregates/index.ts'), 'utf8');
      expect(client).not.toMatch(/export interface AIProviderConfigSummary\b/);
      expect(index).not.toContain('AIProviderConfigSummary');
      expect(client).toContain(
        'export type AIProviderConfigClientDTO = z.infer<typeof AIProviderConfigClientDTOSchema>',
      );
      expect(client).not.toMatch(/export interface AIProviderConfigClientDTO\\b/);
    });

    it('retires AIProviderConfigSummarySchema dual; list uses ClientDTO schema', () => {
      const schemas = readFileSync(resolve(aiApi, 'response-schemas.ts'), 'utf8');
      const listDto = readFileSync(resolve(aiApi, 'ai-provider-config.dto.ts'), 'utf8');
      expect(schemas).not.toMatch(/export const AIProviderConfigSummarySchema\b/);
      expect(schemas).toContain('AIProviderConfigClientDTOSchema');
      expect(schemas).toMatch(
        /ListAIProviderConfigsResSchema[\s\S]*data:\s*z\.array\(AIProviderConfigClientDTOSchema\)/,
      );
      expect(listDto).toContain(
        'export type ListAIProviderConfigsRes = z.infer<typeof ListAIProviderConfigsResSchema>',
      );
      expect(listDto).toMatch(/no Summary dual-track/);
      expect(listDto).not.toMatch(/export interface ListAIProviderConfigsRes\b/);
    });

    it('retires GoalTimeRangeSummary dual; GoalClientDTO remains as z.infer', () => {
      const goalClient = readFileSync(resolve(modules, 'goal/aggregates/goal-client.ts'), 'utf8');
      const goalIndex = readFileSync(resolve(modules, 'goal/aggregates/index.ts'), 'utf8');
      expect(goalClient).not.toMatch(/export interface GoalTimeRangeSummary\b/);
      expect(goalIndex).not.toContain('GoalTimeRangeSummary');
      expect(goalClient).toContain(
        'export type GoalClientDTO = z.infer<typeof GoalClientDTOSchema>',
      );
      expect(goalClient).not.toMatch(/export interface GoalClientDTO\b/);
    });
  });
}

// --- merged from provider-test-result-dual.surface.spec.ts ---
{
  /**
   * Residual 721: AI provider test result dual body retired.
   * TestAIProviderResultDTO reuses TestAIProviderResultDTOSchema only.
   */
  describe('provider test result dual retired (residual 721)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, '../dtos/provider-test-result.dto.ts'), 'utf8');
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const providerDto = readFileSync(resolve(apiDir, 'ai-provider-config.dto.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../ai/src/api/routes/ai-provider.routes.ts'),
      'utf8',
    );

    it('exports TestAIProviderResultDTOSchema as sole test-result shape from dto module', () => {
      expect(dto).toContain('Residual 721');
      expect(dto).toContain('export const TestAIProviderResultDTOSchema = z.object({');
    });

    it('semantic DTO is z.infer alias without interface dual body', () => {
      expect(dto).toContain(
        'export type TestAIProviderResultDTO = z.infer<typeof TestAIProviderResultDTOSchema>',
      );
      expect(dto).not.toMatch(/export interface TestAIProviderResultDTO\b/);
    });

    it('response-schemas re-exports dto-owned schema; provider res + routes use it', () => {
      expect(responseSchemas).toContain('Residual 721');
      expect(responseSchemas).toContain("from '../dtos/provider-test-result.dto'");
      expect(responseSchemas).toContain('export { TestAIProviderResultDTOSchema }');
      expect(responseSchemas).not.toMatch(
        /export const TestAIProviderResultDTOSchema = z\.object\(\{/,
      );
      expect(providerDto).toContain('export type TestAIProviderRes = TestAIProviderResultDTO');
      expect(routes).toContain('TestAIProviderResultDTOSchema');
    });
  });
}

// --- merged from reindex-knowledge-res-dual.surface.spec.ts ---
{
  /**
   * Residual 761: ReindexKnowledgeRes dual body retired.
   * OpenAPI + transport use ReindexKnowledgeResSchema; Res is z.infer alias.
   */
  describe('reindex knowledge res dual retired (residual 761)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'ai-knowledge-query.dto.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../ai/src/api/routes/ai-knowledge-query.routes.ts'),
      'utf8',
    );

    it('dto owns ReindexKnowledgeResSchema and z.infer Res alias', () => {
      expect(dto).toContain('Residual 761');
      expect(dto).toContain('export const ReindexKnowledgeResSchema = z.object({');
      expect(dto).toContain(
        'export type ReindexKnowledgeRes = z.infer<typeof ReindexKnowledgeResSchema>',
      );
      expect(dto).not.toMatch(/export interface ReindexKnowledgeRes\b/);
    });

    it('OpenAPI reindex route uses shared Res schema (no inline dual body)', () => {
      expect(routes).toContain('ReindexKnowledgeResSchema');
      expect(routes).toContain("successResponse(ReindexKnowledgeResSchema, '重建成功')");
      expect(routes).not.toMatch(/successResponse\(\s*z\.object\(\{[\s\S]*indexedCount/);
    });

    it('result item schema remains nested under Res schema', () => {
      expect(dto).toContain('export const ReindexKnowledgeResultItemSchema');
      expect(dto).toContain('results: z.array(ReindexKnowledgeResultItemSchema)');
    });
  });
}

// --- AI-VNEXT-07 canonical assistant runtime surface ---
{
  describe('AI Assistant runtime is the single stream surface', () => {
    const apiDir = __dirname;
    const eventMap = readFileSync(resolve(apiDir, '../protocol/ai-event-map.ts'), 'utf8');
    const rpcMap = readFileSync(resolve(apiDir, '../protocol/ai-rpc-map.ts'), 'utf8');

    it('projects canonical AssistantRuntimeEvent instead of legacy message-stream payloads', () => {
      expect(eventMap).toContain('AssistantRuntimeEvent');
      expect(eventMap).toContain("'ai:runtime:assistant:event'");
      expect(eventMap).not.toContain('StreamMessageDonePayload');
      expect(eventMap).not.toContain('SendMessageRes');
    });

    it('RPC map exposes Mastra assistant start/history and no legacy message stream start', () => {
      expect(rpcMap).toContain("'ai:runtime:assistant:start'");
      expect(rpcMap).toContain("'ai:runtime:assistant:history'");
      expect(rpcMap).not.toContain("'ai:chat:message:stream:start'");
      expect(rpcMap).not.toContain('StreamMessageDonePayload');
    });
  });
}

// --- merged from token-usage-dual.surface.spec.ts ---
{
  /**
   * Residual 727: AI token usage dual body retired.
   * TokenUsageDTO reuses TokenUsageSchema only (VO-owned; response-schemas re-exports).
   */
  describe('token usage dual retired (residual 727)', () => {
    const apiDir = __dirname;
    const vo = readFileSync(resolve(apiDir, '../value-objects/token-usage.ts'), 'utf8');
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const runtimeDto = readFileSync(resolve(apiDir, 'ai-runtime.dto.ts'), 'utf8');

    it('exports TokenUsageSchema as sole token-usage shape from VO module', () => {
      expect(vo).toContain('Residual 727');
      expect(vo).toContain('export const TokenUsageSchema = z.object({');
    });

    it('semantic DTO is z.infer alias without interface dual body', () => {
      expect(vo).toContain('export type TokenUsageDTO = z.infer<typeof TokenUsageSchema>');
      expect(vo).not.toMatch(/export interface TokenUsageDTO\b/);
    });

    it('response-schemas keep the VO schema while canonical runtime owns its usage envelope', () => {
      expect(responseSchemas).toContain('Residual 727');
      expect(responseSchemas).toContain("from '../value-objects/token-usage'");
      expect(responseSchemas).toContain('export { TokenUsageSchema }');
      expect(responseSchemas).not.toMatch(/const TokenUsageSchema = z\.object\(\{/);
      expect(runtimeDto).toContain('AIRuntimeUsageSchema');
      expect(runtimeDto).toContain('assistant.usage.updated');
      expect(runtimeDto).toContain('workflow.usage.updated');
    });
  });
}
