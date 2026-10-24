import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AI void-success envelope surface (stage-6 residual 87/88):
 * delete/setDefault document and serialize data:null on HTTP and Desktop IPC —
 * no ActionSuccessSchema `{ success: boolean }` and no bare Result.void undefined dual-track.
 */
describe('ai void success envelope surface', () => {
  const chatRoutes = readFileSync(resolve(__dirname, './ai-chat.routes.ts'), 'utf8');
  const providerRoutes = readFileSync(resolve(__dirname, './ai-provider.routes.ts'), 'utf8');
  const providerController = readFileSync(
    resolve(__dirname, '../../server/transport/ai-provider-config.controller.ts'),
    'utf8',
  );
  const chatController = readFileSync(
    resolve(__dirname, '../../server/transport/ai-chat.controller.ts'),
    'utf8',
  );
  const electron = readFileSync(resolve(__dirname, '../../electron/index.ts'), 'utf8');
  const responseSchemas = readFileSync(
    resolve(__dirname, '../../../../contracts/src/modules/ai/api/response-schemas.ts'),
    'utf8',
  );

  it('OpenAPI void responses use z.null(), not ActionSuccessSchema', () => {
    expect(chatRoutes).toContain("successResponse(z.null(), '删除成功')");
    expect(providerRoutes).toContain("successResponse(z.null(), '删除成功')");
    expect(providerRoutes).toContain("successResponse(z.null(), '设置成功')");
    expect(chatRoutes).not.toContain('ActionSuccessSchema');
    expect(providerRoutes).not.toContain('ActionSuccessSchema');
    expect(responseSchemas).not.toContain('ActionSuccessSchema');
  });

  it('HTTP controllers return ok(null) for void mutations', () => {
    expect(providerController).toContain('return ok(null)');
    expect(chatController).toContain('return ok(null)');
    expect(providerController).toMatch(/async delete\([\s\S]*?Promise<Result<null>>/);
    expect(chatController).toMatch(/async deleteConversation\([\s\S]*?Promise<Result<null>>/);
  });

  it('Desktop IPC void handlers map to ok(null) (provider delete/set-default + conversation delete)', () => {
    expect(electron).toContain('AIChannels.PROVIDER_DELETE');
    expect(electron).toContain('AIChannels.PROVIDER_SET_DEFAULT');
    expect(electron).toContain('AIChannels.CONVERSATION_DELETE');
    // Each void handler should normalize success to ok(null) rather than pass Result.void through.
    const providerDelete = electron.slice(
      electron.indexOf('AIChannels.PROVIDER_DELETE'),
      electron.indexOf('AIChannels.PROVIDER_TEST'),
    );
    const setDefault = electron.slice(
      electron.indexOf('AIChannels.PROVIDER_SET_DEFAULT'),
      electron.indexOf('AIChannels.PROVIDER_REFRESH_MODELS'),
    );
    const conversationDelete = electron.slice(
      electron.indexOf('AIChannels.CONVERSATION_DELETE'),
      electron.indexOf('AIChannels.RUNTIME_ASSISTANT_START'),
    );
    for (const block of [providerDelete, setDefault, conversationDelete]) {
      expect(block).toContain('return ok(null)');
      expect(block).toContain('if (!result.ok) return result');
    }
  });
});
