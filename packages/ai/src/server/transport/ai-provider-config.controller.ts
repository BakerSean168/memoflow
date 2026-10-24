import { fail, ok, type Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import {
  CommitAIProviderOnboardingSchema,
  ProbeAIProviderConnectionSchema,
  TestAIProviderOnboardingModelSchema,
  ProbeAIProviderReplacementSchema,
  CommitAIProviderReplacementSchema,
  TestAIProviderSchema,
  type TestAIProviderReq,
  type TestAIProviderRes,
  UpdateAIProviderConfigSchema,
  type UpdateAIProviderConfigReq,
  type UpdateAIProviderConfigRes,
  type AIProviderConfigClientDTO,
  type ListAIProviderConfigsRes,
  type ListAIProviderCatalogRes,
  type CommitAIProviderOnboardingReq,
  type ProbeAIProviderReplacementReq,
  type CommitAIProviderReplacementReq,
  type ProbeAIProviderConnectionReq,
  type ProbeAIProviderConnectionRes,
  type TestAIProviderOnboardingModelReq,
  type TestAIProviderOnboardingModelRes,
  type AIProviderModelCatalogSnapshot,
} from '@memoflow/contracts/ai';
import { formatZodErrors } from '@memoflow/utils/result';

interface AIProviderConfigControllerService {
  getProviderCatalog(): Promise<Result<ListAIProviderCatalogRes>>;
  probeProviderConnection(
    request: ProbeAIProviderConnectionReq,
    cx: ExecutionContext,
  ): Promise<Result<ProbeAIProviderConnectionRes>>;
  testProviderOnboardingModel(
    request: TestAIProviderOnboardingModelReq,
    cx: ExecutionContext,
  ): Promise<Result<TestAIProviderOnboardingModelRes>>;
  commitProviderOnboarding(
    request: CommitAIProviderOnboardingReq,
    cx: ExecutionContext,
  ): Promise<Result<AIProviderConfigClientDTO>>;
  probeProviderReplacement(
    providerId: string,
    request: ProbeAIProviderReplacementReq,
    cx: ExecutionContext,
  ): Promise<Result<ProbeAIProviderConnectionRes>>;
  commitProviderReplacement(
    providerId: string,
    request: CommitAIProviderReplacementReq,
    cx: ExecutionContext,
  ): Promise<Result<AIProviderConfigClientDTO>>;
  updateProvider(
    id: string,
    request: UpdateAIProviderConfigReq,
    cx: ExecutionContext,
  ): Promise<Result<UpdateAIProviderConfigRes>>;
  listProviders(cx: ExecutionContext): Promise<Result<AIProviderConfigClientDTO[]>>;
  getProvider(id: string, cx: ExecutionContext): Promise<Result<AIProviderConfigClientDTO>>;
  deleteProvider(id: string, cx: ExecutionContext): Promise<Result<void>>;
  testConnection(
    request: TestAIProviderReq,
    cx: ExecutionContext,
  ): Promise<Result<TestAIProviderRes>>;
  setDefaultProvider(id: string, cx: ExecutionContext): Promise<Result<void>>;
  refreshProviderModels(
    providerId: string,
    cx: ExecutionContext,
  ): Promise<Result<AIProviderModelCatalogSnapshot>>;
}

export class AIProviderConfigController {
  constructor(private readonly service: AIProviderConfigControllerService) {}

  async create(input: unknown, cx: ExecutionContext): Promise<Result<AIProviderConfigClientDTO>> {
    const parsed = CommitAIProviderOnboardingSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.service.commitProviderOnboarding(parsed.data, cx);
  }

  async catalog(): Promise<Result<ListAIProviderCatalogRes>> {
    return this.service.getProviderCatalog();
  }

  async probe(input: unknown, cx: ExecutionContext): Promise<Result<ProbeAIProviderConnectionRes>> {
    const parsed = ProbeAIProviderConnectionSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.service.probeProviderConnection(parsed.data, cx);
  }

  async testOnboardingModel(
    input: unknown,
    cx: ExecutionContext,
  ): Promise<Result<TestAIProviderOnboardingModelRes>> {
    const parsed = TestAIProviderOnboardingModelSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.service.testProviderOnboardingModel(parsed.data, cx);
  }

  async probeReplacement(
    id: string,
    input: unknown,
    cx: ExecutionContext,
  ): Promise<Result<ProbeAIProviderConnectionRes>> {
    const parsed = ProbeAIProviderReplacementSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.service.probeProviderReplacement(id, parsed.data, cx);
  }

  async commitReplacement(
    id: string,
    input: unknown,
    cx: ExecutionContext,
  ): Promise<Result<AIProviderConfigClientDTO>> {
    const parsed = CommitAIProviderReplacementSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.service.commitProviderReplacement(id, parsed.data, cx);
  }

  async update(
    id: string,
    input: unknown,
    cx: ExecutionContext,
  ): Promise<Result<UpdateAIProviderConfigRes>> {
    const parsed = UpdateAIProviderConfigSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }

    return this.service.updateProvider(id, parsed.data, cx);
  }

  async list(cx: ExecutionContext): Promise<Result<ListAIProviderConfigsRes>> {
    const result = await this.service.listProviders(cx);
    if (!result.ok) return result;
    // Single list envelope: contracts ListAIProviderConfigsRes (no bare-array dual-track).
    return ok({ data: result.data });
  }

  async get(id: string, cx: ExecutionContext): Promise<Result<AIProviderConfigClientDTO>> {
    return this.service.getProvider(id, cx);
  }

  async delete(id: string, cx: ExecutionContext): Promise<Result<null>> {
    const result = await this.service.deleteProvider(id, cx);
    if (!result.ok) return result;
    // Serialize as data:null so HttpResponse keeps the data key (no ActionSuccess dual-track).
    return ok(null);
  }

  async test(input: unknown, cx: ExecutionContext): Promise<Result<TestAIProviderRes>> {
    const parsed = TestAIProviderSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }

    return this.service.testConnection(parsed.data, cx);
  }

  async setDefault(id: string, cx: ExecutionContext): Promise<Result<null>> {
    const result = await this.service.setDefaultProvider(id, cx);
    if (!result.ok) return result;
    return ok(null);
  }

  async refreshModels(
    id: string,
    cx: ExecutionContext,
  ): Promise<Result<AIProviderModelCatalogSnapshot>> {
    return this.service.refreshProviderModels(id, cx);
  }
}
