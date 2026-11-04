import { ipcMain } from 'electron';
import { AIChannels, type IElectronModuleContext } from '@memoflow/desktop-contracts';
import { ok } from '@memoflow/transport-contracts/result';
import { withAuthenticatedValue, type AIElectronHandlerDeps } from './context';

/**
 * Provider configuration and onboarding channels.
 * Provider 配置与 onboarding 通道。
 */
export function registerProviderHandlers(
  ctx: IElectronModuleContext,
  deps: AIElectronHandlerDeps,
): void {
  const { instance: aiModule, installed } = deps;
  const { providerManagement } = aiModule;

  // -- Provider Config --
  ipcMain.handle(AIChannels.CAPABILITIES_GET, async () =>
    withAuthenticatedValue(ctx, async () => providerManagement.getCapabilities()),
  );
  installed.push(AIChannels.CAPABILITIES_GET);
  ipcMain.handle(AIChannels.PROVIDER_CATALOG_GET, async () =>
    withAuthenticatedValue(ctx, async () => providerManagement.getProviderCatalog()),
  );
  installed.push(AIChannels.PROVIDER_CATALOG_GET);
  ipcMain.handle(AIChannels.PROVIDER_ONBOARDING_PROBE, async (_, dto) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      providerManagement.probeProviderConnection(dto, requestContext),
    ),
  );
  installed.push(AIChannels.PROVIDER_ONBOARDING_PROBE);
  ipcMain.handle(AIChannels.PROVIDER_ONBOARDING_TEST_MODEL, async (_, dto) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      providerManagement.testProviderOnboardingModel(dto, requestContext),
    ),
  );
  installed.push(AIChannels.PROVIDER_ONBOARDING_TEST_MODEL);
  ipcMain.handle(AIChannels.PROVIDER_ONBOARDING_COMMIT, async (_, dto) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      providerManagement.commitProviderOnboarding(dto, requestContext),
    ),
  );
  installed.push(AIChannels.PROVIDER_ONBOARDING_COMMIT);
  ipcMain.handle(AIChannels.PROVIDER_REPLACEMENT_PROBE, async (_, payload) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      providerManagement.probeProviderReplacement(
        String(payload.providerId),
        payload.request,
        requestContext,
      ),
    ),
  );
  installed.push(AIChannels.PROVIDER_REPLACEMENT_PROBE);
  ipcMain.handle(AIChannels.PROVIDER_REPLACEMENT_COMMIT, async (_, payload) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      providerManagement.commitProviderReplacement(
        String(payload.providerId),
        payload.request,
        requestContext,
      ),
    ),
  );
  installed.push(AIChannels.PROVIDER_REPLACEMENT_COMMIT);
  ipcMain.handle(AIChannels.PROVIDER_LIST, async () =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const result = await providerManagement.listProviders(requestContext);
      if (!result.ok) {
        return result;
      }
      // Align Desktop IPC with contracts ListAIProviderConfigsRes / HTTP list envelope.
      return ok({ data: result.data });
    }),
  );
  installed.push(AIChannels.PROVIDER_LIST);
  ipcMain.handle(AIChannels.PROVIDER_GET, async (_, id) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      providerManagement.getProvider(id, requestContext),
    ),
  );
  installed.push(AIChannels.PROVIDER_GET);
  ipcMain.handle(AIChannels.PROVIDER_UPDATE, async (_, payload) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      providerManagement.updateProvider(String(payload.id), payload, requestContext),
    ),
  );
  installed.push(AIChannels.PROVIDER_UPDATE);
  ipcMain.handle(AIChannels.PROVIDER_DELETE, async (_, id) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const result = await providerManagement.deleteProvider(id, requestContext);
      if (!result.ok) return result;
      // Align with HTTP void success: data:null (no undefined dual-track).
      return ok(null);
    }),
  );
  installed.push(AIChannels.PROVIDER_DELETE);
  ipcMain.handle(AIChannels.PROVIDER_TEST, async (_, dto) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      providerManagement.testConnection(dto, requestContext),
    ),
  );
  installed.push(AIChannels.PROVIDER_TEST);
  ipcMain.handle(AIChannels.PROVIDER_SET_DEFAULT, async (_, dto) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const result = await providerManagement.setDefaultProvider(
        dto.providerId,
        requestContext,
      );
      if (!result.ok) return result;
      return ok(null);
    }),
  );
  installed.push(AIChannels.PROVIDER_SET_DEFAULT);
  ipcMain.handle(AIChannels.PROVIDER_REFRESH_MODELS, async (_, payload) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const request =
        typeof payload === 'string' ? { id: payload, force: false } : (payload ?? {});
      return providerManagement.refreshProviderModels(
        String(request.id),
        requestContext,
        request.force === true,
      );
    }),
  );
  installed.push(AIChannels.PROVIDER_REFRESH_MODELS);
}
